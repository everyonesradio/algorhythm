// ** React/Next.js Imports
import { useRouter } from "next/navigation";
import React, { useState, useEffect } from "react";

// ** Third-Party Imports
import { ToastContainer, toast } from "react-toastify";

// ** Custom Components, Hooks, Utils, etc.
import { api } from "@/utils/trpc";

const Waitlist = () => {
  const router = useRouter();
  const [email, setEmail] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();

  const { mutateAsync: waitlistEntry } = api.waitlist.add.useMutation();

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validation checks
    const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

    if (!email || !emailRegex.test(email)) {
      setErrorMessage("Please enter a valid email address!");
      return;
    }

    if (email) {
      try {
        const res = await waitlistEntry({
          email: email,
        });

        // Reset states
        setEmail("");
        setErrorMessage("");

        router.push("/demo");

        toast.success(res.message, {
          position: "bottom-right",
          autoClose: 2000,
          hideProgressBar: true,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: false,
          progress: undefined,
          theme: "colored",
        });
      } catch (error) {
        console.error("Server error:", error);
      }
    }
  };

  useEffect(() => {
    // Error handling with react-toastify
    if (errorMessage) {
      toast.error(errorMessage, {
        position: "bottom-right",
        autoClose: 2000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
        theme: "colored",
      });
    }

    // Reset error message
    setErrorMessage("");
  }, [errorMessage]);

  return (
    <div className='container mx-auto max-w-sm'>
      <form onSubmit={handleSubmit} method='POST' className='w-full pt-8'>
        <div className='flex flex-col gap-2 sm:flex-row'>
          <label className='sr-only' htmlFor='email-address'>
            Email address
          </label>
          <input
            className='text-accent-500 block h-10 w-full px-4 py-2 border-2 border-black placeholder-zinc-400 duration-200 focus:outline-none focus:ring-zinc-300 sm:text-sm'
            id='email-address'
            name='email'
            placeholder='Enter your email address'
            value={email}
            onChange={handleEmailChange}
          />
          <button
            className='flex h-10 shrink-0 items-center justify-center gap-2 text-white bg-black px-4 py-2 text-sm font-semibold transition-all'
            type='submit'
          >
            <span>Submit</span>
          </button>
        </div>
      </form>
      <ToastContainer
        position='bottom-right'
        autoClose={1800}
        hideProgressBar
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable={false}
        pauseOnHover
        theme='colored'
      />
    </div>
  );
};

export default Waitlist;
