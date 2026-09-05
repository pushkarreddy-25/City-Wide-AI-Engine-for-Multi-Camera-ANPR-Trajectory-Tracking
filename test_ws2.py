import asyncio, websockets, json
async def test():
    async with websockets.connect('ws://localhost:8000/ws/vehicles') as ws:
        print('connected')
        msg = await ws.recv()
        data = json.loads(msg)
        print('num vehicles:', len(data.get('vehicles', [])))
        if data.get('vehicles'):
            print('keys:', data['vehicles'][0].keys())
asyncio.run(test())
