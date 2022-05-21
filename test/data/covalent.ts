// import 'dotenv/config';
import { BigNumber } from 'ethers';
import fetch from 'isomorphic-fetch';

const API_KEY = process.env.COVALENT_API_KEY;
const BASE_URL = `https://api.covalenthq.com/v1/1`

export type TokenHolder = { address: string; balance: BigNumber }

async function getTokenHolders(
  token: string,
  block: number,
  page: number,
  pageSize: number
) {
  const url = `${BASE_URL}/tokens/${token.toLowerCase()}/token_holders/?quote-currency=USD&format=JSON&block-height=${block}&page-number=${page}&page-size=${pageSize}&key=${API_KEY}`;
  const {
    data: {
      items,
      pagination: { has_more }
    }
  } = await fetch(url).then(result => result.json());
  const holders = items.map(({ address, balance }: { address: string; balance: string; }) => ({ address, balance: BigNumber.from(balance) }));
  return { holders, has_more }
}

export async function getAllTokenHolders(token: string, block: number) {
  const allHolders: TokenHolder[] = [];
  let page = 0;
  const pageSize = 2000;
  let has_more = true;
  let holders: TokenHolder[];
  while (has_more) {
    ({ holders, has_more } = await getTokenHolders(token, block, page, pageSize));
    allHolders.push(...holders)
  }
  return allHolders;
}

type Param = {
  name: string;
  value: string;
}

type DecodedEvent = {
  name: string;
  params: Param[]
}

export async function getContractEvents<EventType>(
  address: string,
  eventName: string,
  startBlock: number,
  endBlock: number | string,
  page: number,
  pageSize: number
) {
  const url = `${BASE_URL}/events/address/${address}/?quote-currency=USD&format=JSON&starting-block=${startBlock}&ending-block=${endBlock}&page-number=${page}&page-size=${pageSize}&key=${API_KEY}`;
  const {
    data: {
      items,
      pagination: { has_more }
    }
  } = await fetch(url).then(result => result.json());

  const events: EventType[] = items
    .map(({ decoded }: { decoded: DecodedEvent }) => decoded)
    .filter((_log: DecodedEvent) => _log.name === eventName)
    .map(({ params }: DecodedEvent) => params.reduce(
      (obj, element) => ({
        ...obj,
        [element.name]: element.value
      }),
      {} as EventType)
    );
  return { events, has_more }
}

export async function getAllContractEvents<EventType>(
  address: string,
  eventName: string,
  startBlock: number,
  endBlock: number | string = 'latest',
) {
  const allEvents: EventType[] = [];
  let page = 0;
  const pageSize = 2000;
  let has_more = true;
  let events: EventType[];
  while (has_more) {
    ({ events, has_more } = await getContractEvents<EventType>(address, eventName, startBlock, endBlock, page, pageSize));
    allEvents.push(...events)
  }
  return allEvents;
}