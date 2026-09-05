import asyncio, websockets, json
async def test():
    async with websockets.connect('ws://localhost:8000/ws/vehicles') as ws:
        print('connected')
        msg = await ws.recv()
        data = json.loads(msg)
        print('num vehicles:', len(data.get('vehicles', [])))
        if data.get('vehicles'):
            has_img = any(v.get('image_base64') for v in data['vehicles'])
            print('any has image?', has_img)
asyncio.run(test())
