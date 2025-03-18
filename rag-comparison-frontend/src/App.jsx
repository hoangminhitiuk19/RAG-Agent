import React from 'react';
import ComparisonView from './components/ComparisonView';
import Header from './components/Header';
import './styles/ComparisonView.css';
import './styles/ChatBox.css';
import './styles/Message.css';

const App = () => {
  return (
    <div className="app">
      <Header />
      <ComparisonView />
    </div>
  );
};

export default App;