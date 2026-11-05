'use client';

import {useState} from 'react';
import {Eye, EyeOff, LockKeyhole} from 'lucide-react';

type PasswordInputProps = {
  autoComplete: string;
  id: string;
  minLength?: number;
  name: string;
};

export function PasswordInput({autoComplete, id, minLength, name}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  return (
    <div className="input-wrap">
      <LockKeyhole aria-hidden="true" size={18} />
      <input autoComplete={autoComplete} id={id} minLength={minLength} name={name} required type={isVisible ? 'text' : 'password'} />
      <button
        aria-controls={id}
        aria-label={isVisible ? 'Nascondi password' : 'Mostra password'}
        aria-pressed={isVisible}
        className="password-toggle"
        onClick={() => setIsVisible((value) => !value)}
        title={isVisible ? 'Nascondi password' : 'Mostra password'}
        type="button"
      >
        {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
