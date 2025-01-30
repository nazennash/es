import React, { useState, useEffect } from 'react';
import { auth, googleProvider } from '../firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
} from 'firebase/auth';

<<<<<<< HEAD
=======
const PuzzlePiece = ({ className }) => (
  <div className={`absolute ${className}`}>
    <div className="w-full h-full bg-white rounded-lg transform transition-all duration-700 animate-float" />
  </div>
);

>>>>>>> new
const Auth = ({ onAuthSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [message, setMessage] = useState('');
  const [resetPassword, setResetPassword] = useState(false);
<<<<<<< HEAD

  // Check localStorage on component mount
=======
  const [isLoading, setIsLoading] = useState(false);

>>>>>>> new
  useEffect(() => {
    const user = localStorage.getItem('authUser');
    if (user) {
      onAuthSuccess(JSON.parse(user));
    }
  }, [onAuthSuccess]);

  const handleEmailPasswordAuth = async () => {
<<<<<<< HEAD
=======
    setIsLoading(true);
>>>>>>> new
    try {
      let userCredential;
      if (isLogin) {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
        setMessage('Login successful!');
      } else {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        setMessage('Sign up successful! Please log in.');
      }
<<<<<<< HEAD

=======
>>>>>>> new
      const user = userCredential.user;
      localStorage.setItem('authUser', JSON.stringify(user));
      onAuthSuccess(user);
    } catch (error) {
      setMessage(error.message);
<<<<<<< HEAD
=======
    } finally {
      setIsLoading(false);
>>>>>>> new
    }
  };

  const handleGoogleLogin = async () => {
<<<<<<< HEAD
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

=======
    setIsLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
>>>>>>> new
      localStorage.setItem('authUser', JSON.stringify(user));
      onAuthSuccess(user);
      setMessage('Google login successful!');
    } catch (error) {
      setMessage(error.message);
<<<<<<< HEAD
=======
    } finally {
      setIsLoading(false);
>>>>>>> new
    }
  };

  const handlePasswordReset = async () => {
<<<<<<< HEAD
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('Password reset email sent!');
      setResetPassword(false); // Hide the password reset form after sending the email
    } catch (error) {
      setMessage(error.message);
=======
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('Password reset email sent!');
      setResetPassword(false);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsLoading(false);
>>>>>>> new
    }
  };

  return (
<<<<<<< HEAD
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
=======
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-600 via-blue-500 to-indigo-800 relative overflow-hidden p-4">
      {/* Animated background puzzle pieces */}
      <div className="absolute inset-0 opacity-20">
        <PuzzlePiece className="w-24 h-24 md:w-32 md:h-32 top-1/4 left-1/4 rotate-45" />
        <PuzzlePiece className="w-16 h-16 md:w-24 md:h-24 top-1/2 right-1/3 -rotate-12" />
        <PuzzlePiece className="w-20 h-20 md:w-28 md:h-28 bottom-1/4 left-1/3 rotate-12" />
        <PuzzlePiece className="w-16 h-16 md:w-20 md:h-20 top-1/3 right-1/4 rotate-90" />
        <PuzzlePiece className="w-24 h-24 md:w-32 md:h-32 bottom-1/3 right-1/4 -rotate-45" />
      </div>

      {/* Main container */}
      <div className="w-full max-w-md transform transition-all duration-300 hover:scale-102">
        <div className="backdrop-blur-xl bg-white bg-opacity-90 p-6 md:p-8 rounded-2xl shadow-2xl relative z-10">
          {/* Header animation */}
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-6 animate-fade-in">
            <span className="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
              {isLogin ? 'Welcome Back Puzzler!' : 'Join the Puzzle Adventure'}
            </span>
          </h2>

          {resetPassword ? (
            <div className="space-y-4 animate-slide-up">
              <h3 className="text-xl font-semibold mb-4 text-gray-800">Reset Password</h3>
              <div className="space-y-2">
                <label className="block text-gray-700 font-medium">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-purple-200 rounded-lg focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all duration-300"
                  required
                />
              </div>
              <button
                onClick={handlePasswordReset}
                disabled={isLoading}
                className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-500 text-white font-bold rounded-lg 
                          hover:opacity-90 transform hover:-translate-y-0.5 transition-all duration-300 
                          disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button
                onClick={() => setResetPassword(false)}
                className="w-full text-purple-600 hover:text-purple-800 font-medium transition-colors duration-300"
>>>>>>> new
              >
                Back to Login
              </button>
            </div>
<<<<<<< HEAD
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
=======
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleEmailPasswordAuth();
              }}
              className="space-y-4 animate-slide-up"
            >
              <div className="space-y-2">
                <label className="block text-gray-700 font-medium">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-purple-200 rounded-lg focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all duration-300"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="block text-gray-700 font-medium">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-purple-200 rounded-lg focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all duration-300"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-500 text-white font-bold rounded-lg 
                          hover:opacity-90 transform hover:-translate-y-0.5 transition-all duration-300
                          disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isLoading ? 'Loading...' : (isLogin ? 'Start Your Puzzle Journey' : 'Create Your Account')}
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">Or continue with</span>
                </div>
              </div>

              <button
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full py-3 px-4 bg-gradient-to-r from-red-500 to-red-600 text-white font-bold rounded-lg 
                          hover:opacity-90 transform hover:-translate-y-0.5 transition-all duration-300
                          disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isLoading ? 'Connecting...' : 'Continue with Google'}
              </button>
            </form>
          )}

          <div className="mt-6 space-y-2 text-center">
            {isLogin && !resetPassword && (
              <button
                onClick={() => setResetPassword(true)}
                className="text-purple-600 hover:text-purple-800 font-medium transition-colors duration-300"
              >
                Forgot your password?
              </button>
            )}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="block w-full text-gray-600 hover:text-gray-800 font-medium transition-colors duration-300"
            >
              {isLogin ? 'New Puzzler? Sign Up' : 'Already solving puzzles? Login'}
            </button>
          </div>

          {message && (
            <div className={`mt-4 p-3 rounded-lg text-center animate-fade-in
                          ${message.includes('successful') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              <p className="font-medium">{message}</p>
            </div>
          )}
        </div>
>>>>>>> new
      </div>
    </div>
  );
};

<<<<<<< HEAD
export default Auth;
=======

const style = document.createElement('style');
style.textContent = `
  @keyframes float {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    25% { transform: translateY(-10px) rotate(5deg); }
    75% { transform: translateY(10px) rotate(-5deg); }
  }
  
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes slide-up {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  
  .animate-float {
    animation: float 6s ease-in-out infinite;
  }
  
  .animate-fade-in {
    animation: fade-in 0.5s ease-out forwards;
  }
  
  .animate-slide-up {
    animation: slide-up 0.5s ease-out forwards;
  }
`;
document.head.appendChild(style);

export default Auth;
>>>>>>> new
