export const siteConfig = {
  name: 'Free LLM Router',
  url: 'https://freellmrouter.com',
  description:
    'Find free OpenRouter models with live health and availability. One API call routes to working free models so your app stays up.',
  defaultImage: '/og-image.svg',
};

export interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  noindex?: boolean;
  jsonLd?: object | object[];
}

export function generateOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    url: siteConfig.url,
    logo: `${siteConfig.url}/favicon.svg`,
    description: siteConfig.description,
  };
}

export function generateWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
  };
}

export function generateAPISchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebAPI',
    name: 'Free LLM Router',
    description: 'REST API providing access to free LLM models from OpenRouter',
    url: `${siteConfig.url}/api/v1/models/ids`,
    provider: {
      '@type': 'Organization',
      name: siteConfig.name,
      url: siteConfig.url,
    },
    documentation: `${siteConfig.url}/docs`,
  };
}

/** JSON-LD SoftwareApplication schema for a single model page. */
export function generateModelSchema(model: {
  id: string;
  name: string;
  description?: string | null;
  contextLength?: number | null;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: model.name,
    description: model.description ?? `Free AI model available on OpenRouter.`,
    applicationCategory: 'AI Model',
    operatingSystem: 'Cloud',
    url: `${siteConfig.url}/models/${model.id}`,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    provider: {
      '@type': 'Organization',
      name: siteConfig.name,
      url: siteConfig.url,
    },
  };
}

/** JSON-LD BreadcrumbList schema from an array of {name, url} items. */
export function generateBreadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${siteConfig.url}${item.url}`,
    })),
  };
}

/** JSON-LD CollectionPage schema for a provider page listing its models. */
export function generateProviderSchema(provider: string, modelCount: number) {
  const providerCapitalized = provider.charAt(0).toUpperCase() + provider.slice(1);
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Free ${providerCapitalized} Models on OpenRouter`,
    description: `Browse ${modelCount} free ${providerCapitalized} AI models available on OpenRouter. View reliability and availability data.`,
    url: `${siteConfig.url}/providers/${provider}`,
    provider: {
      '@type': 'Organization',
      name: siteConfig.name,
      url: siteConfig.url,
    },
  };
}

/** JSON-LD FAQPage schema from an array of {question, answer} items. */
export function generateFAQSchema(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}
