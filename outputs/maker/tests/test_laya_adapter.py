import unittest
from packing_test_support import installed_formatter, load_module, tokenizer
from laya_packing import PackingError

SDK = installed_formatter()
ADAPTER = load_module('testable_laya_adapter', 'laya-adapter.py')


class MockAgent(SDK['FormatterAgent']):
    def __init__(self):
        self.tok = tokenizer()
        self.cfg = {'max_len': 512, 'head_max_len': 192}
        self.calls = []

    def predict_batch(self, states, questions, **kwargs):
        self.calls.append({'states': states, 'questions': questions, **kwargs})
        items = self._encode_state(states[0], list(questions),
                                   {key: self._to_internal(q) for key, q in questions.items()},
                                   max_len=kwargs['max_len'], head_max_len=kwargs['head_max_len'])
        return [{'answers': {key: {'choice': 'go'} for key in questions},
                 'usage': {'input_tokens': sum(len(item['ids']) for item in items)}}]


def request(state_tokens=377, request_id='actor', instructions='What next?'):
    return {'id': request_id, 'state': ' '.join(['thing'] * state_tokens),
            'questions': {'do': {'type': 'choice', 'instructions': instructions,
                                 'criteria': {'go': 'Continue', 'wait': 'Wait'}}}}


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.agent = MockAgent()

    def test_complete_377_token_request_is_accepted_with_exact_diagnostics(self):
        results, total, packing = ADAPTER.run_requests(self.agent, [request()], SDK['render_options'])
        self.assertEqual(results['actor']['do']['choice'], 'go')
        diagnostic = packing['actor']['do']
        self.assertEqual(diagnostic['stateTokens'], 377)
        self.assertEqual(total, diagnostic['encodedTokens'])
        self.assertLess(total, 512)
        self.assertEqual(diagnostic['stateBudget'], 511 - diagnostic['headerTokens'])
        self.assertEqual(self.agent.calls[0]['max_len'], 512)
        self.assertEqual(self.agent.calls[0]['head_max_len'], 192)

    def test_invalid_later_batch_member_prevents_all_inference(self):
        with self.assertRaisesRegex(PackingError, 'no facts were truncated') as failure:
            ADAPTER.run_requests(self.agent, [request(), request(600, 'peer')], SDK['render_options'])
        self.assertEqual(self.agent.calls, [])
        self.assertEqual(failure.exception.diagnostics['requestId'], 'peer')
        self.assertEqual(failure.exception.diagnostics['questionId'], 'do')

    def test_each_question_is_checked_using_its_own_header(self):
        body = request(400)
        body['questions']['long'] = request(instructions=' '.join(['thing'] * 140))['questions']['do']
        with self.assertRaisesRegex(PackingError, 'State exceeds') as failure:
            ADAPTER.run_requests(self.agent, [body], SDK['render_options'])
        self.assertEqual(self.agent.calls, [])
        self.assertEqual(failure.exception.diagnostics['questionId'], 'long')

    def test_sdk_silently_truncated_options_are_rejected_even_for_short_state(self):
        body = request(2)
        body['questions']['do']['criteria']['go'] = ' '.join(['thing'] * 47)
        with self.assertRaisesRegex(PackingError, '48-token option'):
            ADAPTER.run_requests(self.agent, [body], SDK['render_options'])
        self.assertEqual(self.agent.calls, [])

    def test_sdk_mismatch_prevents_inference(self):
        encode = self.agent._encode_state
        def wrong(*args, **kwargs):
            result = encode(*args, **kwargs)
            result[0]['ids'] = result[0]['ids'][:-1]
            return result
        self.agent._encode_state = wrong
        with self.assertRaisesRegex(PackingError, 'formatter differs'):
            ADAPTER.run_requests(self.agent, [request()], SDK['render_options'])
        self.assertEqual(self.agent.calls, [])

    def test_config_cannot_expand_checkpoint_beyond_512(self):
        self.agent.cfg['max_len'] = 8192
        results, _, _ = ADAPTER.run_requests(self.agent, [request()], SDK['render_options'])
        self.assertIn('actor', results)
        self.assertEqual(self.agent.calls[0]['max_len'], 512)
        with self.assertRaisesRegex(PackingError, 'State exceeds'):
            ADAPTER.run_requests(self.agent, [request(600)], SDK['render_options'])
        self.assertEqual(len(self.agent.calls), 1)

    def test_no_model_packages_loaded_by_testable_adapter(self):
        import sys
        self.assertNotIn('torch', sys.modules)
        self.assertNotIn('laya', sys.modules)


if __name__ == '__main__':
    unittest.main()
