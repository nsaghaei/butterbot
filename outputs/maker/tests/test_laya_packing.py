import json
import subprocess
import sys
import unittest
from packing_test_support import SOURCE, TOKENIZER_PATH, installed_formatter, tokenizer
from laya_packing import PackingError, choice_options, pack_state, prepare_header, state_ids, verify_encoded


class PackingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tok = tokenizer()
        cls.sdk = installed_formatter()

    def question(self, instructions='What next?', choices=None):
        return {'t': 'choice', 'ins': instructions, 'crit': choices or {'go': 'Continue', 'wait': 'Wait'}}

    def header(self, q):
        return prepare_header(self.tok, q['t'], q['ins'], self.sdk['render_options'](q))

    def assert_parity(self, state, q):
        expected = pack_state(self.tok, state, self.header(q))
        ids, markers = self.sdk['build_sequence'](self.tok, state, q, truncate_left=isinstance(state, list))
        self.assertEqual(expected['ids'], ids)
        self.assertEqual(expected['markers'], markers)
        verify_encoded(expected, [{'ids': ids, 'markers': markers}])
        return expected

    def test_exact_boundary_retains_all_state_and_strict_margin(self):
        q = self.question()
        header = self.header(q)
        room = header['diagnostics']['stateBudget']
        self.assertGreater(room, 362)
        state = ' '.join(['thing'] * room)
        self.assertEqual(len(state_ids(self.tok, state)), room)
        result = self.assert_parity(state, q)
        self.assertEqual(len(result['ids']), 511)
        self.assertEqual(result['diagnostics']['encodedTokens'], 511)
        for extra in (1, 2, 100):
            with self.subTest(extra=extra), self.assertRaisesRegex(PackingError, 'no facts were truncated'):
                pack_state(self.tok, state + ' thing' * extra, header)

    def test_question_specific_headers_change_capacity_without_changing_state(self):
        short = self.header(self.question())['diagnostics']
        long = self.header(self.question(' '.join(['consider'] * 30)))['diagnostics']
        self.assertGreater(short['stateBudget'], long['stateBudget'])
        for diagnostics in (short, long):
            self.assertEqual(diagnostics['stateBudget'] + diagnostics['headerTokens'], 511)
            self.assertEqual(diagnostics['strictMargin'], 1)

    def test_sdk_parity_for_unicode_masks_empty_and_structured_criteria(self):
        choices = {'empty': '', 'none': None, 'zero': 0, 'false': False,
                   'nested': {'label': 'café 水'}, 'mask': 'Inspect [MASK] now'}
        q = self.question('Inspect café, 水 and [MASK]?', choices)
        self.assertEqual(choice_options(choices), self.sdk['render_options'](q))
        for state in ('Names: café 水 [MASK]. Position=(1.25, -3).', {'objects': ['水', '[MASK]']},
                      [{'role': 'user', 'content': 'Inspect the 水 object.'}]):
            with self.subTest(state=state):
                self.assert_parity(state, q)

    def test_existing_score_and_noul_formatter_parity(self):
        for q in ({'t': 'score', 'ins': 'How useful?', 'crit': ['low', {'level': 'high'}]},
                  {'t': 'noul', 'ins': 'Is it reachable?', 'crit': {'true': 'Nearby'},
                   'labels': {'false': 'no', 'true': 'yes'}}):
            with self.subTest(q=q):
                self.assert_parity('Target is one meter away.', q)

    def test_option_48_token_boundary_and_reject_silent_sdk_truncation(self):
        valid = self.question(choices={'go': ' '.join(['thing'] * 46)})
        self.assertEqual(self.header(valid)['diagnostics']['optionTokens'], [48])
        self.assert_parity('Position (0,0).', valid)
        invalid = self.question(choices={'go': ' '.join(['thing'] * 47)})
        with self.assertRaisesRegex(PackingError, '48-token option'):
            self.header(invalid)
        # The installed SDK would silently shorten this label, despite fitting the overall limit.
        ids, _ = self.sdk['build_sequence'](self.tok, 'Position (0,0).', invalid)
        self.assertLess(len(ids), 512)

    def test_instruction_and_combined_option_budgets_fail_before_sdk_compaction(self):
        with self.assertRaisesRegex(PackingError, 'header budget'):
            self.header(self.question(' '.join(['thing'] * 200)))
        with self.assertRaisesRegex(PackingError, 'header budget'):
            self.header(self.question(choices={str(i): ' '.join(['thing'] * 42) for i in range(4)}))

    def test_formatter_mismatch_and_lost_markers_fail_closed(self):
        expected = pack_state(self.tok, 'Facts remain complete.', self.header(self.question()))
        for altered in ({'ids': expected['ids'][:-1], 'markers': expected['markers']},
                        {'ids': expected['ids'], 'markers': expected['markers'][:-1]},
                        {'ids': [0] + expected['ids'][1:], 'markers': expected['markers']}):
            with self.subTest(altered=altered), self.assertRaisesRegex(PackingError, 'formatter differs'):
                verify_encoded(expected, [altered])

    def test_limit_cannot_be_raised(self):
        for limit in (513, 8192):
            with self.subTest(limit=limit), self.assertRaisesRegex(PackingError, 'must not exceed 512'):
                prepare_header(self.tok, 'choice', 'Next?', ['go'], checkpoint_limit=limit)

    def test_tokenizer_process_recovers_after_bad_json_and_reports_exact_counts(self):
        request = {'id': 10, 'question': 'What next?', 'choices': {'go': 'Continue', 'wait': 'Wait'},
                   'variants': [' '.join(['thing'] * n) for n in (371, 377, 800)]}
        input_lines = '\n'.join(('not json', json.dumps(request), json.dumps({'id': 11, 'question': 'x', 'choices': {}, 'variants': []}),
                                 json.dumps({**request, 'id': 12}))) + '\n'
        process = subprocess.run([sys.executable, '-B', str(SOURCE / 'token-budget.py'), str(TOKENIZER_PATH)],
                                 input=input_lines, capture_output=True, text=True, check=True)
        results = [json.loads(line) for line in process.stdout.splitlines()]
        self.assertIsNone(results[0]['id'])
        self.assertIn('error', results[0])
        self.assertIn('error', results[2])
        self.assertEqual(results[2]['id'], 11)
        self.assertEqual(results[3]['id'], 12)
        valid = results[1]
        self.assertEqual(valid['counts'], [371, 377, 800])
        self.assertEqual(valid['stateBudget'], 511 - valid['headerTokens'])
        self.assertGreater(valid['stateBudget'], 377)
        self.assertEqual(valid['encodedCounts'], [valid['headerTokens'] + n for n in valid['counts']])


if __name__ == '__main__':
    unittest.main()
