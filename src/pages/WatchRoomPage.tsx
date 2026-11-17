import React from 'react';
import { WatchExperience } from '../components/WatchExperience';

export function WatchRoomPage({ roomCode }: { roomCode: string }) {
  return <WatchExperience mode="room" roomCodeParam={roomCode} />;
}
export default WatchRoomPage;
