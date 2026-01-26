import { Reqi } from '@pksep/reqi';

export interface ChatMediaInterface {}

export class ChatMedia implements ChatMediaInterface {
  private reqi: Reqi;

  constructor(reqi: Reqi) {
    this.reqi = reqi;
  }
}
