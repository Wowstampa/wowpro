'use client';
/* eslint-disable @next/next/no-img-element -- avatar served through a signed redirect */

import {useState} from 'react';

const initials = (value: string) => value.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

// Team member photo with initials as fallback when no photo has been uploaded.
export function Avatar({profileId, name, size = 48, version, className}: {profileId?: string | null; name: string; size?: number; version?: string | number; className?: string}) {
  const [failed, setFailed] = useState(false);
  const style = {width: size, height: size, fontSize: Math.round(size * 0.32)};
  if (!profileId || failed) return <span className={`avatar ${className || ''}`} style={style}>{initials(name || 'WowStampa')}</span>;
  return <img alt={name} className={`avatar ${className || ''}`} height={size} onError={() => setFailed(true)} src={`/api/avatars/${profileId}${version ? `?v=${version}` : ''}`} style={style} width={size} />;
}
