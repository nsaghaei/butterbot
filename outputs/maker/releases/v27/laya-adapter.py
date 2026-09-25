"""Dedicated loopback Laya adapter; uses existing weights read-only."""
import os
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
os.environ['PYTHONDONTWRITEBYTECODE']='1'
import argparse, json, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import torch, laya
parser=argparse.ArgumentParser()
parser.add_argument('--model',required=True)
parser.add_argument('--port',type=int,default=8766)
args=parser.parse_args()
torch.set_num_threads(6)
agent=laya.load(str(Path(args.model).resolve()),device='cuda' if torch.cuda.is_available() else 'cpu')
lock=threading.Lock()
stats={'calls':0,'decisions':0}
class Handler(BaseHTTPRequestHandler):
    def reply(self,status,payload):
        raw=json.dumps(payload).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def local(self):
        return self.headers.get('Host') in (f'127.0.0.1:{args.port}',f'localhost:{args.port}') and self.headers.get('Origin') is None
    def do_GET(self):
        if not self.local():return self.reply(403,{'error':'Local server calls only'})
        if self.path!='/api/health':return self.reply(404,{'error':'Unknown endpoint'})
        self.reply(200,{'ready':True,'local':True,'device':str(agent.device),'hardware':torch.cuda.get_device_name() if torch.cuda.is_available() else 'CPU','model':'laya-general','version':laya.__version__,'dedicated':True,**stats})
    def do_POST(self):
        if not self.local():return self.reply(403,{'error':'Local server calls only'})
        if self.path!='/api/decide':return self.reply(404,{'error':'Unknown endpoint'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<100000:raise ValueError('Invalid request size')
            body=json.loads(self.rfile.read(size));requests=body['requests']
            if not 1<=len(requests)<=4:raise ValueError('Maximum 4 requests')
            results={};tokens=0;start=time.perf_counter()
            with lock:
                for r in requests:
                    state=r['state'];questions=r['questions']
                    if len(agent.tok.encode(state,add_special_tokens=False))>agent.cfg.get('max_len',512)-150:raise ValueError('State exceeds checkpoint context budget')
                    for key,q in questions.items():
                        agent._check_question(key,q)
                        encoded=agent._encode_state(state,[key],{key:agent._to_internal(q)})
                        if any(len(item['ids'])>=agent.cfg.get('max_len',512) for item in encoded):raise ValueError('Question exceeds checkpoint context budget')
                    prediction=agent.predict_batch([state],questions,batch_size=1)[0]
                    results[r['id']]=prediction['answers'];tokens+=prediction['usage']['input_tokens']
                stats['calls']+=1;stats['decisions']+=len(requests)
            self.reply(200,{'results':results,'usage':{'calls':1,'decisions':len(requests),'inputTokens':tokens,'millis':round((time.perf_counter()-start)*1000),'model':'laya-general','local':True,'device':str(agent.device)}})
        except Exception as error:self.reply(400,{'error':str(error)})
print(f'Dedicated Laya adapter ready on 127.0.0.1:{args.port}',flush=True)
ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
