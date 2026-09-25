"""Load only the installed SDK's pure formatter functions, never its models."""
import ast
import importlib.util
import json
import os
from pathlib import Path
import sys
import typing
from tokenizers import Tokenizer

SOURCE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SOURCE))
from laya_packing import RawTokenizer

TOKENIZER_PATH = Path(os.environ.get('LAYA_TOKENIZER', Path(sys.prefix).parent / 'models/laya/tokenizer/tokenizer.json'))
COMMON_PATH = Path(os.environ.get('LAYA_COMMON_PY', Path(sys.prefix) / 'Lib/site-packages/laya/common.py'))
AGENT_PATH = Path(os.environ.get('LAYA_AGENT_PY', COMMON_PATH.with_name('agent.py')))


def load_module(name, file):
    spec = importlib.util.spec_from_file_location(name, SOURCE / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def installed_formatter():
    names = {'serialize_state', 'render_criterion', '_resolve_noul_labels', 'render_options', 'build_sequence'}
    parsed = ast.parse(COMMON_PATH.read_text(encoding='utf-8'))
    definitions = [node for node in parsed.body if isinstance(node, ast.FunctionDef) and node.name in names]
    assert len(definitions) == len(names), 'Installed formatter changed; review parity tests'
    namespace = {name: getattr(typing, name) for name in ('Any', 'Dict', 'List', 'Optional', 'Union')}
    namespace.update(json=json, _DEFAULT_NOUL_LABELS={'false': 'false', 'true': 'true'},
                     QTYPES={'choice': 0, 'score': 1, 'noul': 2})
    exec(compile(ast.Module(body=definitions, type_ignores=[]), str(COMMON_PATH), 'exec'), namespace)
    parsed_agent = ast.parse(AGENT_PATH.read_text(encoding='utf-8'))
    methods = {'_check_question', '_to_internal', '_encode_state'}
    agent = next(node for node in parsed_agent.body if isinstance(node, ast.ClassDef) and
                 methods <= {child.name for child in node.body if isinstance(child, ast.FunctionDef)})
    extracted = ast.ClassDef(name='FormatterAgent', bases=[], keywords=[], decorator_list=[],
                             body=[node for node in agent.body if isinstance(node, ast.FunctionDef) and node.name in methods])
    tree = ast.fix_missing_locations(ast.Module(body=[extracted], type_ignores=[]))
    exec(compile(tree, str(AGENT_PATH), 'exec'), namespace)
    return namespace


def tokenizer():
    return RawTokenizer(Tokenizer.from_file(str(TOKENIZER_PATH)))
