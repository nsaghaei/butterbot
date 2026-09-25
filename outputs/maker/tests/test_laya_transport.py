"""Exercise the actual UTF-8 Node-to-Python pipe, including Windows defaults."""
import json
import os
import subprocess
import sys
import unittest
from packing_test_support import SOURCE, TOKENIZER_PATH, installed_formatter, tokenizer
from laya_packing import pack_state, prepare_header


class TransportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tok = tokenizer()
        cls.sdk = installed_formatter()

    def measure_bytes(self, request):
        process = subprocess.run(
            [sys.executable, '-B', str(SOURCE / 'token-budget.py'), str(TOKENIZER_PATH)],
            input=(json.dumps(request, ensure_ascii=False) + '\n').encode('utf-8'),
            capture_output=True, check=True,
            env={**os.environ, 'PYTHONIOENCODING': 'cp1252', 'PYTHONUTF8': '0'})
        return json.loads(process.stdout.decode('utf-8'))

    def test_captured_completion_smart_punctuation_matches_adapter_exactly(self):
        fixture = json.loads((SOURCE / 'tests/fixtures/completion-smart-punctuation.json').read_text(encoding='utf-8'))
        request = fixture['request']
        result = self.measure_bytes(request)
        self.assertEqual(result['headerTokens'], 55)
        self.assertEqual(result['instructionTokens'], 25)
        self.assertEqual(result['optionTokens'], [12, 12])
        self.assertEqual(result['stateBudget'], 456)
        self.assertEqual(result['counts'], [388])
        self.assertEqual(result['encodedCounts'], [443])
        q = {'t': 'choice', 'ins': request['question'], 'crit': request['choices']}
        ids, _ = self.sdk['build_sequence'](self.tok, request['variants'][0], q)
        self.assertEqual(len(ids), result['encodedCounts'][0])

    def test_unescaped_unicode_state_question_and_choices_have_exact_counts(self):
        request = {
            'id': 'unicode-pipe', 'question': 'Inspect caf\u00e9\u2019s \u6c34 object \u2014 or wait? \U0001f916',
            'choices': {'inspect': 'Inspect \u6c34 \U0001f9e1', 'wait': 'Wait by caf\u00e9'},
            'variants': ['Name: \u6c34\u2014caf\u00e9. Description: \U0001f916\U0001f9e1\u2019. Path: C:\\Users\\\u65e5\u672c\\caf\u00e9.json.',
                         'Object names: \u65e5\u672c\u8a9e \u6c34 \U0001f9e1. Facts are retained exactly.']}
        q = {'t': 'choice', 'ins': request['question'], 'crit': request['choices']}
        header = prepare_header(self.tok, q['t'], q['ins'], self.sdk['render_options'](q))
        expected = [pack_state(self.tok, state, header) for state in request['variants']]
        result = self.measure_bytes(request)
        self.assertEqual(result['headerTokens'], header['diagnostics']['headerTokens'])
        self.assertEqual(result['counts'], [item['diagnostics']['stateTokens'] for item in expected])
        self.assertEqual(result['encodedCounts'], [len(item['ids']) for item in expected])
        for state, item in zip(request['variants'], expected):
            sdk_ids, sdk_markers = self.sdk['build_sequence'](self.tok, state, q)
            self.assertEqual(item['ids'], sdk_ids)
            self.assertEqual(item['markers'], sdk_markers)


if __name__ == '__main__':
    unittest.main()
