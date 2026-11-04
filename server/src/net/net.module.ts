import { Module } from '@nestjs/common';
import { NetGateway } from './net.gateway';

@Module({ providers: [NetGateway] })
export class NetModule {}
