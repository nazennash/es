import React, { useState, useEffect } from 'react';
import { auth, googleProvider } from '../firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
} from 'firebase/auth';

const Auth = ({ onAuthSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [message, setMessage] = useState('');
  const [resetPassword, setResetPassword] = useState(false);

  // Check localStorage on component mount
  useEffect(() => {
    const user = localStorage.getItem('authUser');
    if (user) {
      onAuthSuccess(JSON.parse(user));
    }
  }, [onAuthSuccess]);

  const handleEmailPasswordAuth = async () => {
    try {
      let userCredential;
      if (isLogin) {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
        setMessage('Login successful!');
      } else {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        setMessage('Sign up successful! Please log in.');
      }

      const user = userCredential.user;
      localStorage.setItem('authUser', JSON.stringify(user));
      onAuthSuccess(user);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      localStorage.setItem('authUser', JSON.stringify(user));
      onAuthSuccess(user);
      setMessage('Google login successful!');
    } catch (error) {
      setMessage(error.message);
    }
  };

  const handlePasswordReset = async () => {
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('Password reset email sent!');
      setResetPassword(false); // Hide the password reset form after sending the email
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
      <div className="w-full max-w-sm p-6 bg-white rounded shadow-md">
        <h2 className="text-2xl font-bold text-center mb-4">
          {isLogin ? 'Login' : 'Sign Up'}
        </h2>

        {/* Password reset section */}
        {resetPassword ? (
          <div>
            <h3 className="text-xl font-semibold mb-4">Reset Password</h3>
            <div className="mb-4">
              <label htmlFor="email" className="block text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring focus:ring-blue-300"
                required
              />
            </div>
            <button
              onClick={handlePasswordReset}
              className="w-full py-2 px-4 bg-blue-500 text-white font-bold rounded hover:bg-blue-600 transition duration-200"
            >
              Send Password Reset Email
            </button>
            <div className="text-center mt-4">
              <button
                onClick={() => setResetPassword(false)}
                className="text-gray-700 hover:underline text-sm"
              >
                Back to Login
              </button>
            </div>
          </div>
        ) : (
          // Login/Sign Up form
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleEmailPasswordAuth();
            }}
          >
            <div className="mb-4">
              <label htmlFor="email" className="block text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring focus:ring-blue-300"
                required
              />
            </div>
            <div className="mb-4">
              <label htmlFor="password" className="block text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring focus:ring-blue-300"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 px-4 bg-blue-500 text-white font-bold rounded hover:bg-blue-600 transition duration-200"
            >
              {isLogin ? 'Login' : 'Sign Up'}
            </button>
          </form>
        )}

        <button
          onClick={handleGoogleLogin}
          className="w-full mt-3 py-2 px-4 bg-red-500 text-white font-bold rounded hover:bg-red-600 transition duration-200"
        >
          Sign in with Google
        </button>

        <div className="text-center mt-4">
          {isLogin ? (
            <button
              onClick={() => setResetPassword(true)}
              className="text-blue-500 hover:underline text-sm"
            >
              Forgot password?
            </button>
          ) : (
            <button
              onClick={() => setIsLogin(true)}
              className="text-gray-700 hover:underline text-sm"
            >
              Already have an account? Login
            </button>
          )}
        </div>

        <div className="text-center mt-4">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-gray-700 hover:underline text-sm"
          >
            {isLogin ? 'Don’t have an account? Sign Up' : 'Already have an account? Login'}
          </button>
        </div>

        {message && <p className="mt-4 text-center text-red-500">{message}</p>}
      </div>
    </div>
  );
};

export default Auth;
