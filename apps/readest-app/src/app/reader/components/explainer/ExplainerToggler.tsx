'use client';

import React from 'react';
import { LuGraduationCap } from 'react-icons/lu';

import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useExplainerStore } from '@/store/explainerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import Button from '@/components/Button';

interface ExplainerTogglerProps {
  bookKey: string;
}

const ExplainerToggler: React.FC<ExplainerTogglerProps> = ({ bookKey }) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { setHoveredBookKey } = useReaderStore();
  const { setSideBarBookKey } = useSidebarStore();
  const { toggleExplainer } = useExplainerStore();
  const iconSize18 = useResponsiveSize(18);

  const handleToggle = () => {
    if (appService?.isMobile) setHoveredBookKey('');
    // The panel is book-scoped for the upcoming history view; the current item
    // (if any) stays in session memory.
    setSideBarBookKey(bookKey);
    toggleExplainer();
  };

  return (
    <Button
      icon={<LuGraduationCap size={iconSize18} className='text-base-content' />}
      onClick={handleToggle}
      label={_('Explain')}
    />
  );
};

export default ExplainerToggler;
