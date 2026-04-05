import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';

export interface CurrentUserPayload {
  userId: string;
  username: string;
  rol: RolUsuario;
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserPayload;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
