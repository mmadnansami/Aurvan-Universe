import { DEFAULT_BOOTSTRAP_DATA } from '../../src/shared/defaultBootstrap';

export default function handler(_req: any, res: any) {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  res.status(200).json(DEFAULT_BOOTSTRAP_DATA);
}
