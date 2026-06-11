import type { Language } from '@/types/launcher';

type Copy = {
  play: string;
  syncing: string;
  settings: string;
  files: string;
  map: string;
  logs: string;
  resync: string;
  openFolder: string;
  nickname: string;
  backend: string;
  ram: string;
  closeOnLaunch: string;
  autoConnect: string;
  showLogs: string;
  java: string;
  choose: string;
  save: string;
};

const copy: Record<Language, Copy> = {
  pl: {
    play: 'GRAJ',
    syncing: 'SYNC',
    settings: 'Ustawienia',
    files: 'Pliki',
    map: 'Mapa',
    logs: 'Logi',
    resync: 'Wymuś re-sync',
    openFolder: 'Otwórz folder',
    nickname: 'Nick',
    backend: 'Backend',
    ram: 'RAM',
    closeOnLaunch: 'Zminimalizuj po starcie MC',
    autoConnect: 'Auto-connect',
    showLogs: 'Pokaż logi',
    java: 'Java',
    choose: 'Wybierz',
    save: 'Zapisz'
  },
  en: {
    play: 'PLAY',
    syncing: 'SYNC',
    settings: 'Settings',
    files: 'Files',
    map: 'Map',
    logs: 'Logs',
    resync: 'Force re-sync',
    openFolder: 'Open folder',
    nickname: 'Nickname',
    backend: 'Backend',
    ram: 'RAM',
    closeOnLaunch: 'Minimize after MC launch',
    autoConnect: 'Auto-connect',
    showLogs: 'Show logs',
    java: 'Java',
    choose: 'Choose',
    save: 'Save'
  }
};

export function t(language: Language): Copy {
  return copy[language] ?? copy.pl;
}
