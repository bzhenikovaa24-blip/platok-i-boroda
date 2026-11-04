import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] || '';
    const [type, token] = header.split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException('Нужен вход: заголовок Authorization: Bearer <токен>');
    req.user = this.auth.verify(token);
    return true;
  }
}
