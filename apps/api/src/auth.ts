import { UnauthorizedException } from '@nestjs/common';
import { TokenVerifier } from 'livekit-server-sdk';

const verifier = new TokenVerifier(
  process.env.LIVEKIT_API_KEY ?? 'devkey',
  process.env.LIVEKIT_API_SECRET ?? 'devsecret-devsecret-devsecret-32chars',
);

export interface RoomIdentity {
  identity: string;
  name: string;
  room: string;
}

/** Checks a LiveKit token is valid and was issued for `room`. Throws on any failure. */
export async function verifyToken(token: string, room: string): Promise<RoomIdentity> {
  const claims = await verifier.verify(token);
  if (claims.video?.room !== room || !claims.sub) throw new Error('wrong room');
  return { identity: claims.sub, name: claims.name || claims.sub, room };
}

/** Authenticates an HTTP request via its bearer token. */
export async function authenticate(authorization: string | undefined, room: string): Promise<RoomIdentity> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  if (!token) throw new UnauthorizedException('Missing bearer token');
  try {
    return await verifyToken(token, room);
  } catch {
    throw new UnauthorizedException('Invalid or expired token');
  }
}
