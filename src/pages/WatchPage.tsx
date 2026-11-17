import React from 'react';
import { WatchExperience } from '../components/WatchExperience';
import type { PlayableMediaType } from '../types/media';

export function WatchPage({ playType, playId }: { playType: PlayableMediaType; playId: string }) {
  return <WatchExperience mode="play" playType={playType} playId={playId} />;
}
export default WatchPage;
