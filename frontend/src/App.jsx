import { useState } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import AboutPage from './components/AboutPage';
import GuidePage from './components/GuidePage';
import HomePage from './components/HomePage';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Routes, Route } from 'react-router-dom';

function App() {
  const [currentPage, setCurrentPage] = useState('fileTransfer');

  return (
    <div className="min-h-screen flex flex-col">
      <ToastContainer position="top-center" autoClose={1500} />
      <div className="sticky top-0 z-50">
        <Header currentPage={currentPage} setCurrentPage={setCurrentPage} />
      </div>
      <main className="flex-grow bg-gradient-to-br from-indigo-100 to-white relative">
        <div className={`w-full h-full transition-opacity duration-300 overflow-y-auto p-6 ${currentPage === 'fileTransfer' ? 'opacity-100 z-10 flex items-center justify-center min-h-full' : 'opacity-0 absolute inset-0 -z-10'}`}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/:roomId" element={<HomePage />} />
          </Routes>
        </div>
        <div className={`w-full h-full transition-opacity duration-300 overflow-y-auto p-6 ${currentPage === 'guide' ? 'opacity-100 z-10 flex items-center justify-center min-h-full' : 'opacity-0 absolute inset-0 -z-10'}`}>
          <div className="max-w-2xl mx-auto">
            <GuidePage />
          </div>
        </div>
        <div className={`w-full h-full transition-opacity duration-300 overflow-y-auto p-6 ${currentPage === 'about' ? 'opacity-100 z-10 flex items-center justify-center min-h-full' : 'opacity-0 absolute inset-0 -z-10'}`}>
          <div className="max-w-2xl mx-auto">
            <AboutPage />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default App;