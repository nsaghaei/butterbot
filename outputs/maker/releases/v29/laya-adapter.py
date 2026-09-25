"""Dedicated loopback Laya adapter; uses existing weights read-only."""
import os
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
import argparse
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from laya_packing import CHECKPOINT_LIMIT, HEADER_LIMIT, PackingError, prepare_header, pack_state, verify_encoded


def preflight_requests(agent, requests, render_options):
    """Validate the whole batch before any model call, with no SDK truncation."""
    if not isinstance(requests, list) or not 1 <= len(requests) <= 4:
        raise ValueError('Maximum 4 requests')
    checkpoint_limit = min(CHECKPOINT_LIMIT, agent.cfg.get('max_len', CHECKPOINT_LIMIT))
    header_limit = min(HEADER_LIMIT, agent.cfg.get('head_max_len', HEADER_LIMIT))
    packing = {}
    for request in requests:
        request_id = request['id']
        if not isinstance(request_id, str) or not request_id or request_id in packing:
            raise ValueError('Request IDs must be unique non-empty strings')
        questions = request['questions']
        if not isinstance(questions, dict) or not questions:
            raise ValueError('A request needs at least one question')
        packing[request_id] = {}
        for key, question in questions.items():
            try:
                agent._check_question(key, question)
                internal = agent._to_internal(question)
                header = prepare_header(agent.tok, internal['t'], internal['ins'], render_options(internal),
                                        checkpoint_limit=checkpoint_limit, header_limit=header_limit)
                expected = pack_state(agent.tok, request['state'], header)
                encoded = agent._encode_state(request['state'], [key], {key: internal},
                                              max_len=checkpoint_limit, head_max_len=header_limit)
                packing[request_id][key] = verify_encoded(expected, encoded)
            except PackingError as error:
                error.diagnostics = {'requestId': request_id, 'questionId': key, **error.diagnostics}
                raise
    return packing, checkpoint_limit, header_limit


def run_requests(agent, requests, render_options):
    packing, checkpoint_limit, header_limit = preflight_requests(agent, requests, render_options)
    results = {}
    tokens = 0
    for request in requests:
        prediction = agent.predict_batch([request['state']], request['questions'], batch_size=1,
                                         max_len=checkpoint_limit, head_max_len=header_limit)[0]
        results[request['id']] = prediction['answers']
        tokens += prediction['usage']['input_tokens']
    return results, tokens, packing


def make_handler(agent, port, version, hardware, render_options):
    lock = threading.Lock()
    stats = {'calls': 0, 'decisions': 0}

    class Handler(BaseHTTPRequestHandler):
        def reply(self, status, payload):
            raw = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def local(self):
            return self.headers.get('Host') in (f'127.0.0.1:{port}', f'localhost:{port}') and self.headers.get('Origin') is None

        def do_GET(self):
            if not self.local():
                return self.reply(403, {'error': 'Local server calls only'})
            if self.path != '/api/health':
                return self.reply(404, {'error': 'Unknown endpoint'})
            self.reply(200, {'ready': True, 'local': True, 'device': str(agent.device), 'hardware': hardware,
                             'model': 'laya-general', 'version': version, 'dedicated': True,
                             'checkpointLimit': CHECKPOINT_LIMIT, 'packing': 'exact-per-question', **stats})

        def do_POST(self):
            if not self.local():
                return self.reply(403, {'error': 'Local server calls only'})
            if self.path != '/api/decide':
                return self.reply(404, {'error': 'Unknown endpoint'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size < 100000:
                    raise ValueError('Invalid request size')
                body = json.loads(self.rfile.read(size))
                requests = body['requests']
                start = time.perf_counter()
                with lock:
                    results, tokens, packing = run_requests(agent, requests, render_options)
                    stats['calls'] += 1
                    stats['decisions'] += len(requests)
                self.reply(200, {'results': results, 'packing': packing,
                                 'usage': {'calls': 1, 'decisions': len(requests), 'inputTokens': tokens,
                                           'millis': round((time.perf_counter() - start) * 1000),
                                           'model': 'laya-general', 'local': True, 'device': str(agent.device)}})
            except Exception as error:
                payload = {'error': str(error)}
                if getattr(error, 'diagnostics', None):
                    payload['tokenBudget'] = error.diagnostics
                self.reply(400, payload)

    return Handler


def main():
    import torch
    import laya
    from laya.common import render_options
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    parser.add_argument('--port', type=int, default=8766)
    args = parser.parse_args()
    torch.set_num_threads(6)
    agent = laya.load(str(Path(args.model).resolve()), device='cuda' if torch.cuda.is_available() else 'cpu')
    hardware = torch.cuda.get_device_name() if torch.cuda.is_available() else 'CPU'
    handler = make_handler(agent, args.port, laya.__version__, hardware, render_options)
    print(f'Dedicated Laya adapter ready on 127.0.0.1:{args.port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), handler).serve_forever()


if __name__ == '__main__':
    main()
