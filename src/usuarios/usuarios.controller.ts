import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { JwtAuthGuard } from '../core/jwt-auth.guard';
import { RolesGuard } from '../core/roles.guard';
import { Roles } from '../core/roles.decorator';
import { CurrentUser } from '../core/current-user.decorator';
import type { CurrentUserPayload } from '../core/current-user.decorator';
import { CreateUsuarioDto, UpdateUsuarioDto, ChangePasswordDto } from './dto';
import { RolUsuario } from '@prisma/client';

@Controller('usuarios')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsuariosController {
  constructor(private readonly service: UsuariosService) {}

  @Get()
  @Roles(RolUsuario.ADMIN)
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @Roles(RolUsuario.ADMIN)
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @Roles(RolUsuario.ADMIN)
  create(@Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) dto: CreateUsuarioDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(RolUsuario.ADMIN)
  update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) dto: UpdateUsuarioDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(RolUsuario.ADMIN)
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }

  @Patch(':id/rol')
  @Roles(RolUsuario.ADMIN)
  changeRole(
    @Param('id') id: string,
    @Body('rol') rol: RolUsuario,
  ) {
    return this.service.changeRole(id, rol);
  }

  @Post('cambiar-password')
  changePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) dto: ChangePasswordDto,
  ) {
    return this.service.changePassword(user.userId, dto);
  }
}
