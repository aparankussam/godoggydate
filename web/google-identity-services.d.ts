declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: google.accounts.id.IdConfiguration) => void;
          prompt: () => void;
          cancel: () => void;
          renderButton: (
            parent: HTMLElement,
            options: google.accounts.id.GsiButtonConfiguration,
          ) => void;
        };
      };
    };
  }

  namespace google.accounts.id {
    interface CredentialResponse {
      credential?: string;
      select_by?: string;
      clientId?: string;
    }

    interface IdConfiguration {
      client_id: string;
      callback: (response: CredentialResponse) => void | Promise<void>;
      cancel_on_tap_outside?: boolean;
      use_fedcm_for_prompt?: boolean;
    }

    interface GsiButtonConfiguration {
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?:
        | 'signin_with'
        | 'signup_with'
        | 'continue_with'
        | 'signin'
        | 'signup';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      width?: number;
    }
  }
}

export {};
