import React from 'react';
import PaymentForm from './components/PaymentForm';

const GameComponent = () => {
  const handlePaymentSuccess = (paymentDetails) => {
    console.log('Payment successful:', paymentDetails);
    // Update game state, unlock features, etc.
  };

  const handlePaymentError = (error) => {
    console.error('Payment failed:', error);
    // Show error message to user
  };

  return (
    <div>
      <h1>Puzzle Game</h1>
      <PaymentForm
        amount={999} // Amount in cents
        onSuccess={handlePaymentSuccess}
        onError={handlePaymentError}
      />
    </div>
  );
};