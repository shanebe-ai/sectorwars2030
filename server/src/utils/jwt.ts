import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_change_me';
const JWT_EXPIRES_IN = '7d'; // Token expires in 7 days

export interface JwtPayload {
  userId: number;
  username: string;
  email: string;
  isAdmin: boolean;
  // The player the user picked to play as. Absent on tokens issued
  // before the universe picker; see utils/activePlayer.ts.
  playerId?: number;
}

export const generateToken = (payload: JwtPayload): string => {
  // Copy only the known claims so a decoded token (which also holds
  // iat and exp) can be passed back in when issuing a new one.
  const claims: JwtPayload = {
    userId: payload.userId,
    username: payload.username,
    email: payload.email,
    isAdmin: payload.isAdmin,
  };
  if (payload.playerId) claims.playerId = payload.playerId;
  return jwt.sign(claims, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

export const verifyToken = (token: string): JwtPayload | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch (error) {
    return null;
  }
};

export const decodeToken = (token: string): JwtPayload | null => {
  try {
    const decoded = jwt.decode(token) as JwtPayload;
    return decoded;
  } catch (error) {
    return null;
  }
};
