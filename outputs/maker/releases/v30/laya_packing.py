"""Exact, CPU-only packing guards for the 512-token English Laya checkpoint.

The SDK formatter truncates oversized inputs. These helpers instead construct
the entire sequence and reject it before inference. One token remains unused,
preserving the adapter's existing strict ``encoded length < checkpoint limit``.
"""
import json

CHECKPOINT_LIMIT = 512
HEADER_LIMIT = 192
OPTION_LIMIT = 48
STRICT_MARGIN = 1


class PackingError(ValueError):
    def __init__(self, message, diagnostics=None):
        super().__init__(message)
        self.diagnostics = diagnostics or {}


def serialize_state(state):
    return state if isinstance(state, str) else json.dumps(state, ensure_ascii=False)


def choice_options(choices):
    """Match SDK choice rendering, including empty and structured criteria."""
    if not isinstance(choices, dict) or not choices:
        raise PackingError('A choice question needs a non-empty criteria object')
    result = []
    for key, value in choices.items():
        if not isinstance(key, str):
            raise PackingError('Choice labels must be strings')
        if value is None or value == '':
            result.append(key)
        else:
            description = value if isinstance(value, str) else json.dumps(
                value, ensure_ascii=False, separators=(', ', ': '), default=str)
            result.append('%s: %s' % (key, description))
    return result


def token_ids(tok, text):
    return list(tok(text.replace(tok.mask_token, ' '), add_special_tokens=False)['input_ids'])


def state_ids(tok, state):
    return token_ids(tok, serialize_state(state))


def prepare_header(tok, question_type, instructions, options, *,
                   checkpoint_limit=CHECKPOINT_LIMIT, header_limit=HEADER_LIMIT):
    if type(checkpoint_limit) is not int or not 1 < checkpoint_limit <= CHECKPOINT_LIMIT:
        raise PackingError('Checkpoint packing limit must not exceed 512')
    if type(header_limit) is not int or not 16 <= header_limit <= HEADER_LIMIT:
        raise PackingError('Checkpoint header limit must not exceed 192')
    if not options:
        raise PackingError('A question needs at least one option')
    if not isinstance(instructions, str):
        instructions = json.dumps(instructions, ensure_ascii=False)
    head = token_ids(tok, '%s question: %s' % (question_type, instructions))
    option_ids = [token_ids(tok, ' ' + option) for option in options]
    option_counts = [len(ids) for ids in option_ids]
    option_tokens = sum(count + 1 for count in option_counts)
    header_tokens = 4 + len(head) + option_tokens  # CLS, three SEP, and one MASK per option.
    diagnostics = {
        'checkpointLimit': checkpoint_limit, 'headLimit': header_limit,
        'optionLimit': OPTION_LIMIT, 'strictMargin': STRICT_MARGIN,
        'headerTokens': header_tokens, 'instructionTokens': len(head),
        'optionTokens': option_counts,
        'stateBudget': checkpoint_limit - STRICT_MARGIN - header_tokens,
    }
    if any(count > OPTION_LIMIT for count in option_counts):
        raise PackingError('An option exceeds the checkpoint 48-token option budget; no text was truncated', diagnostics)
    instruction_budget = header_limit - option_tokens
    if instruction_budget < 16 or len(head) > max(8, instruction_budget):
        raise PackingError('Question and option labels exceed the checkpoint header budget; no text was truncated', diagnostics)
    if diagnostics['stateBudget'] < 0:
        raise PackingError('Question exceeds checkpoint context budget', diagnostics)
    ids = [tok.cls_token_id] + head + [tok.sep_token_id]
    markers = []
    for option in option_ids:
        markers.append(len(ids))
        ids += [tok.mask_token_id] + option
    ids.append(tok.sep_token_id)
    return {'ids': ids, 'markers': markers, 'diagnostics': diagnostics}


def pack_state(tok, state, header):
    state_tokens = state_ids(tok, state)
    diagnostics = {**header['diagnostics'], 'stateTokens': len(state_tokens),
                   'encodedTokens': header['diagnostics']['headerTokens'] + len(state_tokens)}
    if len(state_tokens) > diagnostics['stateBudget']:
        raise PackingError('State exceeds checkpoint context budget (%d tokens; limit %d); no facts were truncated'
                           % (len(state_tokens), diagnostics['stateBudget']), diagnostics)
    return {'ids': header['ids'] + state_tokens + [tok.sep_token_id],
            'markers': list(header['markers']), 'diagnostics': diagnostics}


def verify_encoded(expected, encoded):
    """Fail closed if the installed SDK differs, truncates, or drops markers."""
    if len(encoded) != 1 or list(encoded[0]['ids']) != expected['ids'] or list(encoded[0]['markers']) != expected['markers']:
        raise PackingError('Installed Laya formatter differs from the verified complete sequence; decision was not sent',
                           expected['diagnostics'])
    return expected['diagnostics']


class RawTokenizer:
    """Adapt tokenizers.Tokenizer to the SDK's text-only tokenizer interface."""
    def __init__(self, tokenizer):
        self.raw = tokenizer
        self.mask_token = '[MASK]'
        self.mask_token_id = tokenizer.token_to_id(self.mask_token)
        self.cls_token_id = tokenizer.token_to_id('[CLS]')
        self.sep_token_id = tokenizer.token_to_id('[SEP]')
        if any(token is None for token in (self.mask_token_id, self.cls_token_id, self.sep_token_id)):
            raise PackingError('Tokenizer lacks the checkpoint framing tokens')

    def __call__(self, text, add_special_tokens=False):
        return {'input_ids': self.raw.encode(text, add_special_tokens=add_special_tokens).ids}
