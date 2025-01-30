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
      setResetPassword(false);
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-600 via-blue-500 to-indigo-800 relative overflow-hidden">
      {/* Animated puzzle pieces background */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-white rounded-lg transform rotate-45 animate-pulse"></div>
        <div className="absolute top-1/2 right-1/3 w-24 h-24 bg-white rounded-lg transform -rotate-12 animate-bounce"></div>
        <div className="absolute bottom-1/4 left-1/3 w-20 h-20 bg-white rounded-lg transform rotate-12 animate-pulse"></div>
      </div>

      <div className="w-full max-w-md p-8 bg-white bg-opacity-90 backdrop-blur-lg rounded-2xl shadow-2xl relative z-10 transform hover:scale-102 transition duration-300">
        <h2 className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
          {isLogin ? 'Welcome Back!' : 'Join the Game'}
        </h2>

        {resetPassword ? (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold mb-4 text-gray-800">Reset Password</h3>
            <div className="space-y-2">
              <label htmlFor="email" className="block text-gray-700 font-medium">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border-2 border-purple-200 rounded-lg focus:outline-none focus:border-purple-500 transition duration-200"
                required
              />
            </div>
            <button
              onClick={handlePasswordReset}
              className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-500 text-white font-bold rounded-lg hover:opacity-90 transform hover:-translate-y-0.5 transition duration-200"
            >
              Send Reset Link
            </button>
            <div className="text-center">
              <button
                onClick={() => setResetPassword(false)}
                className="text-purple-600 hover:text-purple-800 font-medium transition duration-200"
              >
                Back to Login
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleEmailPasswordAuth();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <label htmlFor="email" className="block text-gray-700 font-medium">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border-2 border-purple-200 rounded-lg focus:outline-none focus:border-purple-500 transition duration-200"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="block text-gray-700 font-medium">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border-2 border-purple-200 rounded-lg focus:outline-none focus:border-purple-500 transition duration-200"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-500 text-white font-bold rounded-lg hover:opacity-90 transform hover:-translate-y-0.5 transition duration-200"
            >
              {isLogin ? 'Start Playing' : 'Create Account'}
            </button>
          </form>
        )}

        <button
          onClick={handleGoogleLogin}
          className="w-full mt-4 py-3 px-4 bg-gradient-to-r from-red-500 to-red-600 text-white font-bold rounded-lg hover:opacity-90 transform hover:-translate-y-0.5 transition duration-200"
        >
          Continue with Google
        </button>

        <div className="mt-6 text-center space-y-2">
          {isLogin ? (
            <button
              onClick={() => setResetPassword(true)}
              className="text-purple-600 hover:text-purple-800 font-medium transition duration-200"
            >
              Forgot your password?
            </button>
          ) : null}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="block w-full text-gray-600 hover:text-gray-800 font-medium transition duration-200"
          >
            {isLogin ? 'New Player? Sign Up' : 'Already have an account? Login'}
          </button>
        </div>

        {message && (
          <div className="mt-4 p-3 rounded-lg bg-opacity-20 text-center">
            <p className={`font-medium ${message.includes('successful') ? 'text-green-600' : 'text-red-600'}`}>
              {message}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Auth;