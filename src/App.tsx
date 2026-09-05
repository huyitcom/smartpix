import { useState, useEffect } from 'react';
import Landing from './components/Landing';
import Gallery from './components/Gallery';
import LocalFilter from './components/LocalFilter';

export default function App() {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [initialFileList, setInitialFileList] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const folder = params.get('folder');
    if (folder) {
      setFolderId(folder);
    }
  }, []);

  const handleStart = (id: string) => {
    window.history.pushState({}, '', `?folder=${id}`);
    setFolderId(id);
  };

  const handleBack = () => {
    window.history.pushState({}, '', '/');
    setFolderId(null);
    setShowFilter(false);
  };

  const handleOpenFilter = (fileList = '') => {
    setInitialFileList(fileList);
    setShowFilter(true);
  };

  const handleCloseFilter = () => {
    setShowFilter(false);
  };

  return (
    <div className="min-h-screen bg-sky-50 font-sans text-slate-900 flex flex-col">
      {showFilter ? (
        <LocalFilter onBack={handleCloseFilter} initialFileList={initialFileList} />
      ) : folderId ? (
        <Gallery folderId={folderId} onBack={handleBack} onOpenFilter={handleOpenFilter} />
      ) : (
        <Landing onStart={handleStart} onOpenFilter={handleOpenFilter} />
      )}
    </div>
  );
}
