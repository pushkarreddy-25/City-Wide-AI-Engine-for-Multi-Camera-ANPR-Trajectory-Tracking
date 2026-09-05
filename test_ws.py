import asyncio, websockets
async def test():
    async with websockets.connect('ws://localhost:8000/ws/vehicles') as ws:
        print('connected')
        msg = await ws.recv()
        print('received:', msg[:100])
asyncio.run(test())
