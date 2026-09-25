"""CPU-only checkpoint tokenizer. No model loading, GPU calls, or network."""
import json,sys
from tokenizers import Tokenizer
tokenizer=Tokenizer.from_file(sys.argv[1])
def count(text):return len(tokenizer.encode(text.replace('[MASK]',' '),add_special_tokens=False).ids)
for line in sys.stdin:
    try:
        request=json.loads(line);q=request['question'];choices=request['choices']
        options=[1+count(' '+key+': '+str(value)) for key,value in choices.items()]
        if any(n>49 for n in options):raise ValueError('An option exceeds the checkpoint 48-token option budget')
        head=count('choice question: '+q);option_budget=192-sum(options)
        if option_budget<16 or head>max(8,option_budget):raise ValueError('Question and option labels exceed the checkpoint header budget')
        room=min(362,511-(4+head+sum(options)))
        counts=[count(s) for s in request['variants']]
        sys.stdout.write(json.dumps({'id':request['id'],'counts':counts,'stateBudget':room,'headerTokens':head+sum(options)+4})+'\n');sys.stdout.flush()
    except Exception as error:
        sys.stdout.write(json.dumps({'id':request.get('id'), 'error':str(error)})+'\n');sys.stdout.flush()
