import { useEffect, useState } from 'react';
import type { Campaign } from '../../../types/global';
import { SettingRow } from './controls/setting-row';
import { SelectField } from './controls/select-field';
import { defaultViewSettingsData } from './default-view-settings-data';
import { resolveDefaultView } from './domain/resolve-default-view';
import { DefaultHolderRow } from './default-holder-row';

interface Props {
  activeCampaign: Campaign | null;
}

export function GeneralSection({ activeCampaign }: Props) {
  const [defaultView, setDefaultView] = useState<string>('timeline');

  useEffect(() => {
    if (!activeCampaign) return;

    let cancelled = false;
    const campaignPath = activeCampaign.path;

    defaultViewSettingsData.getCampaignDefaultView(campaignPath).then((saved) => {
      if (cancelled) return;
      setDefaultView(resolveDefaultView(saved));
    });

    return () => {
      cancelled = true;
    };
  }, [activeCampaign?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (next: string) => {
    if (activeCampaign) {
      void defaultViewSettingsData.setCampaignDefaultView(activeCampaign.path, next);
    }
    setDefaultView(next);
  };

  return (
    <>
      <SettingRow
        label="Default view"
        description="The view shown first when this campaign is opened."
        htmlFor="general-default-view"
      >
        <SelectField
          id="general-default-view"
          value={defaultView}
          options={[
            { value: 'timeline', label: 'Timeline' },
            { value: 'notes', label: 'Notes' },
            { value: 'relationships', label: 'Relationships' },
          ]}
          onChange={handleChange}
        />
      </SettingRow>
      {activeCampaign && <DefaultHolderRow campaignPath={activeCampaign.path} />}
    </>
  );
}
