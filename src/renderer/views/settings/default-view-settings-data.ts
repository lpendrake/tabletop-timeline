export const defaultViewSettingsData = {
  async getCampaignDefaultView(campaignPath: string): Promise<string | null> {
    return window.fsApi.getCampaignDefaultView(campaignPath);
  },

  async setCampaignDefaultView(campaignPath: string, view: string | null): Promise<void> {
    return window.fsApi.setCampaignDefaultView(campaignPath, view);
  },
};
