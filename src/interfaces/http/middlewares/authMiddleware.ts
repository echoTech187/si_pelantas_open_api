import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';
import { PoliceRoleType } from '../../../domain/entities/UserEntity';

export interface PoliceTokenPayload {
  accountId: string;
  nrp: string;
  username: string;
  institution: 'POLRI';
  role: PoliceRoleType; // 'POLANTAS' | 'UNIT_KAMSEL'
}

export interface SchoolBkTokenPayload {
  accountId: string;
  nipOrNuptk: string;
  username: string;
  institution: 'SCHOOL_BK';
  role: 'GURU_BK';
  schoolId: string;
}

declare global {
  namespace Express {
    interface Request {
      policeUser?: PoliceTokenPayload;
      bkUser?: SchoolBkTokenPayload;
    }
  }
}

/**
 * Guard khusus untuk Aplikasi Mobile Kepolisian (Polantas & Unit Kamsel)
 */
export function authenticatePoliceJwt(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      message: 'Akses ditolak: Token otorisasi Instansi Polri tidak ditemukan',
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as PoliceTokenPayload;
    if (decoded.institution !== 'POLRI') {
      res.status(403).json({
        success: false,
        message: 'Akses ditolak: Token bukan milik Instansi Kepolisian (POLRI)',
      });
      return;
    }
    req.policeUser = decoded;
    next();
  } catch {
    res.status(401).json({
      success: false,
      message: 'Sesi Polri tidak valid atau telah berakhir',
    });
  }
}

export function authorizePoliceRoles(...allowedRoles: PoliceRoleType[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.policeUser || !allowedRoles.includes(req.policeUser.role)) {
      res.status(403).json({
        success: false,
        message: `Akses terlarang: Endpoint ini hanya untuk fungsi kepolisian [${allowedRoles.join(', ')}]`,
      });
      return;
    }
    next();
  };
}

/**
 * Guard khusus untuk Aplikasi Mobile Guru BK Sekolah
 */
export function authenticateSchoolBkJwt(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      message: 'Akses ditolak: Token otorisasi Guru BK Sekolah tidak ditemukan',
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as SchoolBkTokenPayload;
    if (decoded.institution !== 'SCHOOL_BK' || !decoded.schoolId) {
      res.status(403).json({
        success: false,
        message: 'Akses ditolak: Token bukan milik Instansi Guru BK Sekolah',
      });
      return;
    }
    req.bkUser = decoded;
    next();
  } catch {
    res.status(401).json({
      success: false,
      message: 'Sesi Guru BK tidak valid atau telah berakhir',
    });
  }
}
