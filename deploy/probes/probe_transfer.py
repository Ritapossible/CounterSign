# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *


@gl.evm.contract_interface
class _Payee:
    class View:
        pass

    class Write:
        pass


class ProbeTransfer(gl.Contract):
    sent: u256

    def __init__(self):
        self.sent = u256(0)

    @gl.public.write.payable
    def deposit(self) -> None:
        pass

    @gl.public.write
    def pay_sender(self, amount: int) -> None:
        """As CounterSign's collect: the caller, as gl.message.sender_address."""
        _Payee(gl.message.sender_address).emit_transfer(value=u256(int(amount)))
        self.sent = u256(int(self.sent) + int(amount))

    @gl.public.write
    def pay_address(self, to: str, amount: int) -> None:
        """As Remit's rail: an address string wrapped in Address."""
        _Payee(Address(to)).emit_transfer(value=u256(int(amount)))
        self.sent = u256(int(self.sent) + int(amount))

    @gl.public.write
    def pay_sender_str(self, amount: int) -> None:
        """The caller, as a string wrapped in Address."""
        _Payee(Address(str(gl.message.sender_address))).emit_transfer(value=u256(int(amount)))
        self.sent = u256(int(self.sent) + int(amount))

    @gl.public.view
    def status(self) -> str:
        return "sent=%d balance=%d" % (int(self.sent), int(self.balance))
