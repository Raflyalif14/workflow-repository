import type { en } from "./en";

export type TranslationSchema = {
  [K in keyof typeof en]: {
    [P in keyof (typeof en)[K]]: string;
  };
};

export type TranslationKey = {
  [K in keyof typeof en]: `${K & string}.${keyof (typeof en)[K] & string}`;
}[keyof typeof en];

export type TranslationParams = Record<string, string | number>;
