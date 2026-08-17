import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

export class TaskQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20

  @IsOptional()
  event?: string

  @IsOptional()
  role?: string

  @IsOptional()
  status?: string

  @IsOptional()
  risk?: string
}
