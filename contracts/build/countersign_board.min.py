# v0.2.0
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import datetime
import json
_A = {'amp': '&', 'lt': '<', 'gt': '>', 'quot': '"', 'apos': "'", 'nbsp': ' ', 'rsquo': "'", 'lsquo': "'", 'rdquo': '"', 'ldquo': '"', 'ndash': '-', 'mdash': '-', 'hellip': '...', 'shy': '', 'middot': '*', 'bull': '*'}
_B = {'‘': "'", '’': "'", '‚': "'", '‛': "'", '′': "'", '“': '"', '”': '"', '„': '"', '″': '"', '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '―': '-', '−': '-', '\xa0': ' ', '\u2007': ' ', '\u202f': ' ', '\u2009': ' ', '\u200a': ' ', '\u2002': ' ', '\u2003': ' ', '\u200b': '', '\u200c': '', '\u200d': '', '\ufeff': '', '\xad': '', '…': '...'}
_C = 40
_D = 600

def _E(name):
 if name.startswith('#'):
  try:
   _a = int(name[2:], 16) if name[1:2] in ('x', 'X') else int(name[1:])
   if 0 < _a < 1114112:
    return chr(_a)
  except ValueError:
   return None
  return None
 return _A.get(name.lower())

def _F(text):
 _f = []
 i = 0
 n = len(text)
 while i < n:
  ch = text[i]
  if ch == '&':
   _c = text.find(';', i + 1, i + 12)
   if _c != -1:
    _b = _E(text[i + 1:_c])
    if _b is not None:
     _f.append(_b)
     i = _c + 1
     continue
  _f.append(ch)
  i += 1
 return ''.join(_f)

def _G(text):
 text = _F(str(text))
 _b = []
 for ch in text:
  _b.append(_B.get(ch, ch))
 return ' '.join(''.join(_b).lower().split())

def _H(passage):
 p = _G(passage)
 if len(p) < _C:
  return 'a passage must be at least %d characters' % _C
 if len(p) > _D:
  return 'a passage must be at most %d characters' % _D
 return ''

def _I(hay, needle):
 n = _G(needle)
 if not n:
  return False
 i = hay.find(n)
 while i >= 0:
  _b = hay[i - 1] if i > 0 else ' '
  _a = hay[i + len(n)] if i + len(n) < len(hay) else ' '
  if not _b.isalnum() and (not _a.isalnum()):
   return True
  i = hay.find(n, i + 1)
 return False

def _J(text):
 return ''.join((c if c.isalnum() else ' ' for c in text)).split()
_K = 10 ** 18
_L = _K // 10
_M = _K // 100
_N = _K // 50
_O = 300
_P = 4
_Q = 'pending'
_R = 'registered'
_S = 'refused'
_T = 'pending'
_U = 'live'
_V = 'refused'
_W = 'down'
_X = 'withdrawn'
_Y = (_T, _U)
_Z = 'confirmed'
_AA = 'denied'
_AB = 'silent'
_AC = (_Z, _AA, _AB)
_AD = 'posting'
_AE = 'recheck'
_AF = ('not audited', 'never audited', 'not been audited', 'not yet audited', 'unaudited', 'did not audit', 'does not audit', 'has not audited', 'have not audited', 'never audit', 'not an audit', 'audit was declined', 'declined to audit')
_AG = set('the a an and of for by on in to inc ltd llc co corp company labs lab protocol protocols finance network dao foundation project audit audits audited report reports security smart contract contracts review core app v1 v2 v3'.split())

class _AH(Exception):
 pass

def _AI(value, context='address'):
 a = str(value).strip().lower()
 if len(a) != 42 or not a.startswith('0x') or any((c not in '0123456789abcdef' for c in a[2:])):
  raise _AH('%s is not an address' % context)
 return a

def _AJ(url):
 u = str(url)
 if not u.startswith('https://') or len(u) > _O:
  return 'the page must be an https:// URL of at most %d characters' % _O
 if any((ch.isspace() or ch in '%\\@?#' for ch in u)) or '..' in u:
  return 'the URL may not contain %, .., \\, @, ?, # or spaces'
 _b = u[8:].split('/')[0]
 if '.' not in _b or _b.startswith('.') or _b.endswith('.'):
  return 'the URL has no host'
 return ''

def _AK(url):
 return str(url)[8:].split('/')[0].lower()

def _AL(text):
 return all((ch.isprintable() for ch in text))

def _AM(name):
 n = str(name).strip()
 if not 2 <= len(n) <= 60 or not _AL(n):
  return 'the name must be 2-60 printable characters'
 return ''

def _AN(subject):
 s = str(subject).strip()
 if not 3 <= len(s) <= 80 or not _AL(s):
  return 'the subject must be 3-80 printable characters'
 if sum((1 for ch in s if ch.isalpha())) < 3:
  return 'the subject must contain at least 3 letters'
 if all((w in _AG for w in _J(_G(s)))):
  return 'the subject must be a name, not only common words'
 return ''

def _AO(scope):
 if not isinstance(scope, list) or not 1 <= len(scope) <= _P:
  return ['the scope must be 1-%d strings' % _P]
 _b = []
 for s in scope:
  if not isinstance(s, str) or not 2 <= len(s.strip()) <= 80 or (not _AL(s)):
   _b.append('each scope string must be 2-80 printable characters')
  elif not any((ch.isalnum() for ch in s)):
   _b.append('each scope string must contain a letter or digit')
 return _b

def _AP(name, url, sample):
 _b = [e for e in (_AM(name), _AJ(url)) if e]
 e = _H(sample)
 if e:
  _b.append('the sample: ' + e)
 return _b

def _AQ(*, auditor, project, subject, scope, passage, value):
 _b = []
 if auditor is None:
  return ['unknown auditor']
 if auditor['state'] != _R:
  _b.append('the auditor is not registered')
 if _AI(project) == auditor['signer']:
  _b.append('an auditor cannot post claims on its own entry')
 if isinstance(value, bool) or not isinstance(value, int) or value < _L:
  _b.append('the stake must be at least %d atto' % _L)
 for e in (_AN(subject), _H(passage)):
  if e:
   _b.append(e)
 _f = _AO(scope)
 _b += _f
 if not _b:
  p = _G(passage)
  if _BB(passage):
   _b.append('the passage says the subject was not audited: ' + ', '.join(_BB(passage)))
  if not _I(p, subject):
   _b.append('the subject is not in the passage as whole words')
  _c = [s for s in scope if not _I(p, s)]
  if _c:
   _b.append('not in the passage as whole words: ' + ', '.join(_c))
 return _b

def _AR(*, auditor_id, name, url, sample, signer, now, window):
 return {'id': int(auditor_id), 'name': str(name).strip(), 'url': str(url), 'host': _AK(url), 'signer': _AI(signer, 'signer'), 'sample': str(sample), 'state': _Q, 'at': int(now), 'due': int(now) + int(window)}

def _AS(auditor, *, ok, now):
 if auditor['state'] != _Q:
  return False
 auditor['state'] = _R if ok else _S
 auditor['decided_at'] = int(now)
 return True

def expire_registration(auditor, *, now):
 if auditor['state'] != _Q:
  raise _AH('auditor %d is %s' % (int(auditor['id']), auditor['state']))
 if int(now) <= int(auditor['due']):
  raise _AH('the registration read is open until %d' % int(auditor['due']))
 auditor['state'] = _S
 auditor['decided_at'] = int(now)
 auditor['why'] = 'no agreed read of the page in time'

def _AT(*, claim_id, auditor, project, subject, scope, passage, stake, now):
 return {'id': int(claim_id), 'auditor': int(auditor['id']), 'project': _AI(project, 'project'), 'subject': str(subject).strip(), 'scope': [str(s).strip() for s in scope], 'passage': str(passage), 'stake': int(stake), 'state': _T, 'posted_at': int(now), 'print': '', 'misses': 0, 'miss_at': 0, 'checked_at': 0, 'seq': 0, 'read': None, 'why': ''}

def _AU(claim, *, kind, caller, fee, now, window):
 if claim.get('read'):
  raise _AH('a read of claim %d is open' % int(claim['id']))
 claim['seq'] = int(claim['seq']) + 1
 claim['read'] = {'seq': claim['seq'], 'kind': kind, 'caller': _AI(caller, 'caller'), 'fee': int(fee), 'at': int(now), 'due': int(now) + int(window)}
 return claim['read']

def _AV(claim, *, caller, auditor, value):
 _a = []
 if claim['state'] != _U:
  _a.append('only a live claim can be re-checked')
 elif claim.get('read'):
  _a.append('a read of this claim is already open')
 if isinstance(value, bool) or value != _M:
  _a.append('a re-check costs exactly %d atto' % _M)
 if _AI(caller) == auditor['signer']:
  _a.append('the auditor cannot re-check claims on its own entry')
 return _a

def _AW(credits, who, amount):
 if amount > 0:
  credits[who] = credits.get(who, 0) + int(amount)

def _AX(claim, state, why, now):
 claim['state'] = state
 claim['why'] = why
 claim['ended_at'] = int(now)
 claim['read'] = None

def _AY(claim, read, why, now):
 credits = {}
 _a = min(_N, int(claim['stake']))
 _AW(credits, read['caller'], _a + int(read['fee']))
 _AW(credits, claim['project'], int(claim['stake']) - _a)
 _AX(claim, _W, why, now)
 return credits

def _AZ(claim, *, seq, kind, print_, now, miss_gap):
 _a = claim.get('read')
 if kind not in _AC:
  raise _AH('unknown outcome %r' % kind)
 if not _a or int(seq) != int(_a['seq']) or claim['state'] not in _Y:
  return None
 credits = {}
 if _a['kind'] == _AD:
  if kind == _Z:
   claim['state'] = _U
   claim['print'] = str(print_)
   claim['checked_at'] = int(_a['at'])
   claim['read'] = None
  else:
   _AW(credits, claim['project'], int(claim['stake']))
   _AX(claim, _V, "the auditor's page did not confirm it" if kind == _AA else "the auditor's page was silent", now)
  return credits
 if kind == _Z:
  claim['print'] = str(print_)
  claim['checked_at'] = int(_a['at'])
  claim['misses'] = 0
  claim['miss_at'] = 0
  claim['read'] = None
  _AW(credits, claim['project'], int(_a['fee']))
  return credits
 if kind == _AA:
  return _AY(claim, _a, "the auditor's page denies it", now)
 if int(claim['misses']) and int(_a['at']) >= int(claim['miss_at']) + int(miss_gap):
  return _AY(claim, _a, "the auditor's page was silent twice", now)
 if not int(claim['misses']):
  claim['misses'] = 1
  claim['miss_at'] = int(_a['at'])
 claim['read'] = None
 _AW(credits, _a['caller'], int(_a['fee']))
 return credits

def _BA(claim, *, now, miss_gap):
 _a = claim.get('read')
 if not _a:
  raise _AH('no read of claim %d is open' % int(claim['id']))
 if int(now) <= int(_a['due']):
  raise _AH('the read is open until %d' % int(_a['due']))
 if _a['kind'] == _AD:
  return _AZ(claim, seq=_a['seq'], kind=_AB, print_='', now=now, miss_gap=miss_gap)
 credits = {}
 _AW(credits, _a['caller'], int(_a['fee']))
 claim['read'] = None
 return credits

def withdraw_claim(claim, *, by, now):
 if _AI(by) != claim['project']:
  raise _AH('only the project may withdraw its claim')
 if claim['state'] not in _Y:
  raise _AH('claim %d is %s' % (int(claim['id']), claim['state']))
 credits = {}
 _a = claim.get('read')
 if _a:
  _AW(credits, _a['caller'], int(_a['fee']))
 _AW(credits, claim['project'], int(claim['stake']))
 _AX(claim, _X, 'withdrawn by the project', now)
 return credits

def _BB(passage):
 p = _G(passage)
 return [n for n in _AF if _I(p, n)]

def _BC(claim, auditor):
 _a = dict(claim)
 _a['auditor_name'] = auditor['name']
 _a['auditor_host'] = auditor['host']
 _a['auditor_signer'] = auditor['signer']
 return _a

@gl.evm.contract_interface
class _Payee:

 class View:
  pass

 class Write:
  pass

class CounterSignBoard(gl.Contract):
 release: str
 reader: str
 miss_gap: u256
 read_window: u256
 auditor_count: u256
 auditors: TreeMap[u256, str]
 claim_count: u256
 claims: TreeMap[u256, str]
 owed: TreeMap[str, u256]
 owed_total: u256
 held: u256
 received: u256
 refusals: TreeMap[str, str]

 def __init__(self, reader: str, miss_gap: int, read_window: int):
  if not 60 <= int(miss_gap) <= 30 * 86400 or not 60 <= int(read_window) <= 7 * 86400:
   raise Exception('[EXPECTED] miss_gap and read_window are 60 seconds to 30 and 7 days')
  self.release = 'countersign-board/1'
  self.reader = _AI(reader, 'reader')
  self.miss_gap = u256(int(miss_gap))
  self.read_window = u256(int(read_window))

 def _now(self) -> int:
  return int(datetime.datetime.now().timestamp())

 def _me(self) -> str:
  return str(gl.message.sender_address).lower()

 def _auditor(self, auditor_id: int) -> dict:
  if int(auditor_id) < 0 or int(auditor_id) >= int(self.auditor_count):
   raise Exception('[EXPECTED] unknown auditor')
  return json.loads(self.auditors[u256(int(auditor_id))])

 def _claim(self, claim_id: int) -> dict:
  if int(claim_id) < 0 or int(claim_id) >= int(self.claim_count):
   raise Exception('[EXPECTED] unknown claim')
  return json.loads(self.claims[u256(int(claim_id))])

 def _save_claim(self, claim: dict) -> None:
  self.claims[u256(int(claim['id']))] = json.dumps(claim)

 def _pay(self, credits: dict) -> None:
  _c = 0
  for _d, _a in credits.items():
   _b = str(_d).lower()
   self.owed[_b] = u256(int(self.owed.get(_b, u256(0))) + int(_a))
   _c += int(_a)
  self.held = u256(int(self.held) - _c)
  self.owed_total = u256(int(self.owed_total) + _c)

 def _take(self, value: int) -> None:
  self.held = u256(int(self.held) + value)
  self.received = u256(int(self.received) + value)

 def _refuse(self, reason: str, value: int) -> None:
  me = self._me()
  if value > 0:
   self._take(value)
   self._pay({me: value})
  self.refusals[me] = json.dumps({'reason': str(reason)[:600], 'at': self._now(), 'returned': value})

 def _from_reader(self) -> None:
  if self._me() != self.reader:
   raise Exception('[EXPECTED] only the Reader reports reads')

 def _ask(self, claim: dict, auditor: dict) -> None:
  _a = claim['read']
  gl.get_contract_at(Address(self.reader)).emit(on='accepted').read_claim(int(claim['id']), int(_a['seq']), _a['kind'] == _AD, auditor['url'], auditor['name'], claim['subject'], json.dumps(claim['scope']), claim['passage'], claim['print'])

 @gl.public.write
 def register(self, name: str, page_url: str, sample: str) -> int:
  _c = _AP(str(name), str(page_url), str(sample))
  if _c:
   raise Exception('[EXPECTED] ' + '; '.join(_c))
  _b = int(self.auditor_count)
  _a = _AR(auditor_id=_b, name=str(name), url=str(page_url), sample=str(sample), signer=self._me(), now=self._now(), window=int(self.read_window))
  self.auditors[u256(_b)] = json.dumps(_a)
  self.auditor_count = u256(_b + 1)
  gl.get_contract_at(Address(self.reader)).emit(on='accepted').read_registration(_b, _a['url'], _a['sample'])
  return _b

 @gl.public.write
 def note_registration(self, auditor_id: int, ok: bool) -> None:
  self._from_reader()
  _a = self._auditor(auditor_id)
  if _AS(_a, ok=bool(ok), now=self._now()):
   self.auditors[u256(int(auditor_id))] = json.dumps(_a)

 @gl.public.write.payable
 def post(self, auditor_id: int, subject: str, scope_json: str, passage: str) -> int:
  _f = int(gl.message.value)
  try:
   _e = json.loads(str(scope_json))
  except Exception:
   _e = None
  _a = None
  if 0 <= int(auditor_id) < int(self.auditor_count):
   _a = json.loads(self.auditors[u256(int(auditor_id))])
  _d = ['the scope is not valid JSON'] if _e is None else _AQ(auditor=_a, project=self._me(), subject=str(subject), scope=_e, passage=str(passage), value=_f)
  if _d:
   self._refuse('; '.join(_d), _f)
   return -1
  _c = int(self.claim_count)
  _b = _AT(claim_id=_c, auditor=_a, project=self._me(), subject=str(subject), scope=_e, passage=str(passage), stake=_f, now=self._now())
  _AU(_b, kind=_AD, caller=self._me(), fee=0, now=self._now(), window=int(self.read_window))
  self._take(_f)
  self._save_claim(_b)
  self.claim_count = u256(_c + 1)
  self._ask(_b, _a)
  return _c

 @gl.public.write.payable
 def recheck(self, claim_id: int) -> bool:
  _d = int(gl.message.value)
  if not 0 <= int(claim_id) < int(self.claim_count):
   self._refuse('unknown claim', _d)
   return False
  _b = self._claim(claim_id)
  _a = self._auditor(_b['auditor'])
  _c = _AV(_b, caller=self._me(), auditor=_a, value=_d)
  if _c:
   self._refuse('; '.join(_c), _d)
   return False
  _AU(_b, kind=_AE, caller=self._me(), fee=_d, now=self._now(), window=int(self.read_window))
  self._take(_d)
  self._save_claim(_b)
  self._ask(_b, _a)
  return True

 @gl.public.write
 def note_claim(self, claim_id: int, seq: int, kind: str, print_: str) -> None:
  self._from_reader()
  _a = self._claim(claim_id)
  try:
   credits = _AZ(_a, seq=int(seq), kind=str(kind), print_=str(print_)[:32], now=self._now(), miss_gap=int(self.miss_gap))
  except _AH as _b:
   raise Exception('[EXPECTED] ' + str(_b))
  if credits is not None:
   self._save_claim(_a)
   self._pay(credits)

 @gl.public.write
 def expire_registration(self, auditor_id: int) -> None:
  _a = self._auditor(auditor_id)
  try:
   expire_registration(_a, now=self._now())
  except _AH as _b:
   raise Exception('[EXPECTED] ' + str(_b))
  self.auditors[u256(int(auditor_id))] = json.dumps(_a)

 @gl.public.write
 def expire(self, claim_id: int) -> None:
  _a = self._claim(claim_id)
  try:
   credits = _BA(_a, now=self._now(), miss_gap=int(self.miss_gap))
  except _AH as _b:
   raise Exception('[EXPECTED] ' + str(_b))
  self._save_claim(_a)
  self._pay(credits or {})

 @gl.public.write
 def withdraw_claim(self, claim_id: int) -> None:
  _a = self._claim(claim_id)
  try:
   credits = withdraw_claim(_a, by=self._me(), now=self._now())
  except _AH as _b:
   raise Exception('[EXPECTED] ' + str(_b))
  self._save_claim(_a)
  self._pay(credits)

 @gl.public.write
 def collect(self) -> None:
  me = self._me()
  _a = int(self.owed.get(me, u256(0)))
  if _a <= 0:
   raise Exception('[EXPECTED] nothing is owed to this address')
  self.owed[me] = u256(0)
  self.owed_total = u256(int(self.owed_total) - _a)
  _Payee(gl.message.sender_address).emit_transfer(value=u256(_a))

 @gl.public.view
 def get_auditor(self, auditor_id: int) -> str:
  return json.dumps(self._auditor(auditor_id))

 @gl.public.view
 def get_claim(self, claim_id: int) -> str:
  _a = self._claim(claim_id)
  _b = _BC(_a, self._auditor(_a['auditor']))
  _b['now'] = self._now()
  return json.dumps(_b)

 @gl.public.view
 def owed_to(self, address: str) -> int:
  return int(self.owed.get(str(address).lower(), u256(0)))

 @gl.public.view
 def refusal_of(self, address: str) -> str:
  return self.refusals.get(str(address).lower(), '{}')

 @gl.public.view
 def status(self) -> str:
  return json.dumps({'release': self.release, 'reader': self.reader, 'miss_gap': int(self.miss_gap), 'read_window': int(self.read_window), 'auditors': int(self.auditor_count), 'claims': int(self.claim_count), 'held': int(self.held), 'owed': int(self.owed_total), 'received': int(self.received), 'balance': int(self.balance)})
