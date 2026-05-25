let _campaignPath: string | null = null;

export function getCampaignPath(): string | null {
  return _campaignPath;
}

export function setCampaignPath(p: string | null): void {
  _campaignPath = p;
}
