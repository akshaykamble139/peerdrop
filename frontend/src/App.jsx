// src/App.jsx
import { useState } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import AboutPage from './components/AboutPage';
import GuidePage from './components/GuidePage';
import HomePage from './components/HomePage';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function App() {
  const [currentPage, setCurrentPage] = useState('fileTransfer');

  const renderMainContent = () => {
    switch (currentPage) {
      case 'about':
        return <AboutPage />;
      case 'guide':
        return <GuidePage />;
      case 'fileTransfer':
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <ToastContainer position="top-center" autoClose={1500} />
      <Header currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <main className="flex-grow flex items-center justify-center bg-gradient-to-br from-indigo-100 to-white p-6">
        {renderMainContent()}
      </main>

      <Footer />
    </div>
  );
}

export default App;