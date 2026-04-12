from channels.generic.websocket import AsyncJsonWebsocketConsumer


class DashboardConsumer(AsyncJsonWebsocketConsumer):
    GROUP_NAME = "dashboard"

    async def connect(self):
        await self.channel_layer.group_add(self.GROUP_NAME, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.GROUP_NAME, self.channel_name)

    async def sensor_update(self, event):
        await self.send_json(event)
