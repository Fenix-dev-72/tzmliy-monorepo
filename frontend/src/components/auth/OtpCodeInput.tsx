import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export function OtpCodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
}) {
  return (
    <div className="flex justify-center">
      <InputOTP
        maxLength={length}
        value={value}
        onChange={onChange}
        onComplete={onComplete}
        containerClassName="justify-center"
      >
        <InputOTPGroup>
          {Array.from({ length }, (_, i) => (
            <InputOTPSlot key={i} index={i} />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}
