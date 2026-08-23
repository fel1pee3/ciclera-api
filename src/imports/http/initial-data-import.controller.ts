import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { accessCookieName } from '../../auth/http/auth-cookies';
import { CurrentPrincipal } from '../../auth/http/current-principal.decorator';
import { Roles } from '../../auth/http/roles.decorator';
import { getRequestId, type RequestWithId } from '../../http/request-id';
import { InitialDataImportService } from '../application/initial-data-import.service';
import {
  initialDataWorkbookFileName,
  maxInitialDataWorkbookBytes,
} from '../domain/initial-data-workbook';
import {
  CommitInitialDataImportDto,
  CommitInitialDataWorkbookDto,
  PreviewInitialDataImportDto,
} from './initial-data-import.dto';

const workbookMimeType =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const workbookUpload = FileInterceptor('file', {
  limits: { fileSize: maxInitialDataWorkbookBytes, files: 1 },
});

@ApiTags('imports')
@ApiCookieAuth(accessCookieName)
@Roles('OWNER')
@Controller('imports/initial-data')
export class InitialDataImportController {
  constructor(private readonly imports: InitialDataImportService) {}

  @Get('template.csv')
  @Header('Cache-Control', 'private, no-store')
  @ApiProduces('text/csv')
  template(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.type('text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="modelo-importacao-inicial.csv"',
    );
    return new StreamableFile(Buffer.from(this.imports.template(principal)));
  }

  @Get('template.xlsx')
  @Header('Cache-Control', 'private, no-store')
  @ApiProduces(workbookMimeType)
  async templateWorkbook(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.type(workbookMimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${initialDataWorkbookFileName}"`,
    );
    return new StreamableFile(await this.imports.templateWorkbook(principal));
  }

  @Post('preview')
  @Header('Cache-Control', 'no-store')
  preview(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: PreviewInitialDataImportDto,
  ) {
    return this.imports.preview(principal, input.content);
  }

  @Post('preview-file')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(workbookUpload)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  previewWorkbook(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.imports.previewWorkbook(principal, workbookBuffer(file));
  }

  @Post('commit')
  @Header('Cache-Control', 'no-store')
  commit(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @Body() input: CommitInitialDataImportDto,
  ) {
    return this.imports.commit(principal, getRequestId(request), input);
  }

  @Post('commit-file')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(workbookUpload)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'checksum'],
      properties: {
        file: { type: 'string', format: 'binary' },
        checksum: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      },
    },
  })
  commitWorkbook(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() input: CommitInitialDataWorkbookDto,
  ) {
    return this.imports.commitWorkbook(
      principal,
      getRequestId(request),
      workbookBuffer(file),
      input.checksum,
    );
  }
}

function workbookBuffer(file?: Express.Multer.File) {
  if (!file) {
    throw new BadRequestException('Selecione uma planilha Excel.');
  }
  if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
    throw new BadRequestException('Use um arquivo com extensão .xlsx.');
  }
  if (file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) {
    throw new BadRequestException(
      'O arquivo enviado não é uma planilha válida.',
    );
  }
  return file.buffer;
}
