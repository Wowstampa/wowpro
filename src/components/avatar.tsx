/* eslint-disable @next/next/no-img-element -- avatar served through a signed redirect */

const initials = (value: string) => value.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

// Team member photo over the initials: when no photo exists the (empty-alt) broken image stays invisible and the initials show.
export function Avatar({profileId, name, size = 48, version, className}: {profileId?: string | null; name: string; size?: number; version?: string | number; className?: string}) {
  return <span aria-label={name} className={`person-avatar ${className || ''}`} role="img" style={{width: size, height: size, fontSize: Math.round(size * 0.32)}}>
    {initials(name || 'WowStampa')}
    {profileId ? <img alt="" height={size} src={`/api/avatars/${profileId}${version ? `?v=${version}` : ''}`} width={size} /> : null}
  </span>;
}
