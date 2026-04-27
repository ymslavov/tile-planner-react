import { useEffect } from 'react';
import { useStore } from './store';
import { TopBar } from './components/TopBar/TopBar';
import { TilePool } from './components/TilePool/TilePool';
import { WallView } from './components/WallView/WallView';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { CutSheet } from './components/CutSheet/CutSheet';
import { ToastContainer } from './components/Toast/ToastContainer';
import { CascadeModal } from './components/CascadeModal/CascadeModal';
import './styles/index.css';

function App() {
  const initialize = useStore((s) => s.initialize);
  const cutMode = useStore((s) => s.cutMode);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <>
      <div className="no-print" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TopBar />
        {cutMode ? (
          <CutSheet visibleOnScreen />
        ) : (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <TilePool />
            <WallView />
            <SettingsPanel />
          </div>
        )}
      </div>
      {!cutMode && <CutSheet />}
      <ToastContainer />
      <CascadeModal />
    </>
  );
}

export default App;
