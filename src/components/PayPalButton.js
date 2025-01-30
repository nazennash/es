// src/components/PayPalButton.js
import React from 'react';
import { PayPalButtons } from '@paypal/react-paypal-js';

const PayPalButton = ({ orderID, onSuccess, onError }) => {
  return (
    <PayPalButtons
      orderID={orderID}
      onApprove={async (data, actions) => {
        try {
          const details = await actions.order.capture();
          onSuccess(details);
        } catch (error) {
          onError(error);
        }
      }}
      onError={(err) => {
        onError(err);
      }}
    />
  );
};