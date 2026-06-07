import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, Lock, LogOut, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PinVerification() {
  const { profile, verifyPin, setPinCode, logout, resetPin } = useAuth();
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '', '', '']);
  const [step, setStep] = useState<'enter' | 'create' | 'confirm'>(profile?.hasPin ? 'enter' : 'create');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [step]);

  useEffect(() => {
    if (profile?.hasPin && step === 'create') {
      setStep('enter');
    } else if (!profile?.hasPin && step === 'enter') {
      setStep('create');
    }
  }, [profile?.hasPin, step]);

  const handlePinChange = (index: number, value: string, isConfirm = false) => {
    if (!/^\d*$/.test(value)) return;

    const newPin = isConfirm ? [...confirmPin] : [...pin];
    newPin[index] = value.slice(-1);

    if (isConfirm) {
      setConfirmPin(newPin);
    } else {
      setPin(newPin);
    }

    setError(null);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newPin.every(digit => digit !== '')) {
      const pinString = newPin.join('');
      if (step === 'enter') {
        handleVerify(pinString);
      } else if (step === 'create') {
        setStep('confirm');
        setConfirmPin(['', '', '', '', '', '']);
      } else if (step === 'confirm') {
        if (pin.join('') === pinString) {
          handleSetPin(pinString);
        } else {
          setError('Mã PIN xác nhận không khớp. Vui lòng thử lại.');
          setConfirmPin(['', '', '', '', '', '']);
          setStep('create');
          setPin(['', '', '', '', '', '']);
          inputRefs.current[0]?.focus();
        }
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>, isConfirm = false) => {
    if (e.key === 'Backspace') {
      const currentArr = isConfirm ? confirmPin : pin;
      if (!currentArr[index] && index > 0) {
        // Clear previous and focus
        const newPin = isConfirm ? [...confirmPin] : [...pin];
        newPin[index - 1] = '';
        if (isConfirm) {
          setConfirmPin(newPin);
        } else {
          setPin(newPin);
        }
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handleVerify = async (pinString: string) => {
    setIsLoading(true);
    try {
      const isValid = await verifyPin(pinString);
      if (!isValid) {
        setError('Mã PIN không chính xác.');
        setPin(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      console.error(err);
      setError('Đã xảy ra lỗi khi xác minh PIN.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPin = async (pinString: string) => {
    setIsLoading(true);
    try {
      await setPinCode(pinString);
      toast.success('Mã PIN đã được thiết lập thành công!');
    } catch (err) {
      console.error(err);
      setError('Đã xảy ra lỗi khi tạo PIN.');
      setStep('create');
      setPin(['', '', '', '', '', '']);
      setConfirmPin(['', '', '', '', '', '']);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await resetPin();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Không thể xác thực để đặt lại PIN.');
      setIsLoading(false);
    }
  };

  const renderTitle = () => {
    switch (step) {
      case 'enter': return 'Xác minh mã PIN';
      case 'create': return 'Tạo mã PIN mới';
      case 'confirm': return 'Xác nhận mã PIN';
    }
  };

  const renderDescription = () => {
    switch (step) {
      case 'enter': return 'Vui lòng nhập mã PIN 6 số để tiếp tục truy cập DADFlight.';
      case 'create': return 'Chào mừng bạn! Vui lòng thiết lập mã PIN 6 số bảo mật cho tài khoản của bạn.';
      case 'confirm': return 'Nhập lại mã PIN vừa thiết lập để hoàn tất xác nhận.';
    }
  };

  const currentPinArr = step === 'confirm' ? confirmPin : pin;

  return (
    <div className="auth-screen">
      <div className="absolute" style={{ right: 24, top: 24, zIndex: 100 }}>
        <button
          onClick={logout}
          className="auth-btn-secondary"
          style={{ marginTop: 0 }}
        >
          <LogOut size={14} />
          <span>Đăng xuất</span>
        </button>
      </div>

      <div className="auth-card">
        <div className="auth-logo">
          {step === 'enter' ? (
            <Lock size={26} />
          ) : (
            <ShieldCheck size={26} />
          )}
        </div>

        <h1 className="auth-title">{renderTitle()}</h1>
        <p className="auth-desc">{renderDescription()}</p>

        {error && (
          <div className="auth-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="pin-grid">
          {currentPinArr.map((digit, index) => (
            <input
              key={index}
              ref={el => { inputRefs.current[index] = el; }}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              disabled={isLoading}
              onChange={(e) => handlePinChange(index, e.target.value, step === 'confirm')}
              onKeyDown={(e) => handleKeyDown(index, e, step === 'confirm')}
              className="pin-input"
            />
          ))}
        </div>

        {step === 'enter' && (
          <div style={{ marginTop: '20px' }}>
            <button
              onClick={handleResetPin}
              disabled={isLoading}
              className="auth-btn-secondary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 0 }}
            >
              {isLoading ? 'Đang chuyển hướng...' : 'Quên mã PIN? Đặt lại'}
            </button>
          </div>
        )}

        {isLoading && (
          <div className="spinner" />
        )}
      </div>
    </div>
  );
}
