import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'

export const TRENDING_REGIONS = [
  'Worldwide',
  'United States',
  'United Kingdom',
  'Japan',
  'Korea',
]

export class TrendingQueryDto {
  @IsOptional()
  @IsIn(TRENDING_REGIONS)
  region = 'Worldwide'

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 30
}
