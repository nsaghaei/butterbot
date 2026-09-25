"""CPU-only checkpoint tokenizer. No model loading, GPU calls, or network."""
import json
import sys
from tokenizers import Tokenizer
from laya_packing import RawTokenizer, choice_options, prepare_header, state_ids


def measure_request(tokenizer, request):
    header = prepare_header(tokenizer, 'choice', request['question'], choice_options(request['choices']))
    counts = [len(state_ids(tokenizer, state)) for state in request['variants']]
    diagnostics = header['diagnostics']
    return {'id': request['id'], 'counts': counts, **diagnostics,
            'encodedCounts': [diagnostics['headerTokens'] + count for count in counts]}


def main():
    # Node writes UTF-8 JSON bytes; Windows pipe defaults may otherwise be CP1252.
    sys.stdin.reconfigure(encoding='utf-8', errors='strict')
    sys.stdout.reconfigure(encoding='utf-8', errors='strict')
    tokenizer = RawTokenizer(Tokenizer.from_file(sys.argv[1]))
    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            result = measure_request(tokenizer, request)
        except Exception as error:
            result = {'id': request.get('id') if isinstance(request, dict) else None,
                      'error': str(error)}
            if getattr(error, 'diagnostics', None):
                result['tokenBudget'] = error.diagnostics
        sys.stdout.write(json.dumps(result) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
