import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';

export interface CurrentUserPayload {
  userId: string;
  username: string;
  rol: RolUsuario;
}

interface RequestWithUser {
  user?: CurrentUserPayload;
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
